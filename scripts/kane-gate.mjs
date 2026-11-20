#!/usr/bin/env node
// Kane gate: the closed loop between Kane CLI and the coding agent.
//
// 1. Starts Rails Desk (a fresh production build on a local port) or targets --url.
// 2. Runs the Kane CLI browser tests in tests/kane/*_test.md against it.
// 3. Writes .kane/last-report.json (machine-readable) and KANE_REPORT.md
//    (a re-prompt for the coding agent: what failed, expected vs actual,
//    Kane's own diagnosis, the Kane share link, and the files likely involved).
// 4. Exits 0 when every test passes, 1 when any test fails, 2 on setup errors.
//    A non-zero exit blocks `git push` (pre-push hook), `npm run deploy` and CI.
//
// Credentials come from the environment (LT_USERNAME, LT_ACCESS_KEY) or a
// gitignored .env. They are never printed or written to a report.
//
// Usage:
//   npm run kane:gate                          # build, start on :3100, run all tests
//   npm run kane:gate -- --url https://x.dev   # test an existing deployment
//   npm run kane:gate -- --match blocked       # only tests whose path matches
//   npm run kane:gate -- --skip-if-no-creds    # exit 0 with a notice if creds are missing
//   npm run kane:gate -- --no-build            # reuse an existing .next build
//   npm run kane:gate -- --from .kane/runs/<ts>/kane-stdout.ndjson   # re-render a saved run, no credits
import {spawn, spawnSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "https://preview.invalid";
const KANE_DIR = path.join(ROOT, ".kane");
const REPORT_JSON = path.join(KANE_DIR, "last-report.json");
const REPORT_MD = path.join(ROOT, "KANE_REPORT.md");

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = {from: null, url: null, match: null, tags: null, port: 3100, build: true, name: null};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === "--url") opt.url = next();
  else if (a === "--from") opt.from = next();
  else if (a === "--match") opt.match = next();
  else if (a === "--tags") opt.tags = next();
  else if (a === "--port") opt.port = Number(next());
  else if (a === "--name") opt.name = next();
  else if (a === "--no-build") opt.build = false;
  else if (a === "-h" || a === "--help") { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n")); process.exit(0); }
  else { console.error(`Unknown option: ${a}`); process.exit(2); }
}
if (process.env.KANE_GATE_URL && !opt.url) opt.url = process.env.KANE_GATE_URL;

// ---------- env ----------
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv(path.join(ROOT, ".env"));
if (process.env.KANE_ENV_FILE) loadDotEnv(process.env.KANE_ENV_FILE);

const log = (...m) => console.error("[kane-gate]", ...m);
const fail = (msg, code = 2) => { log(msg); process.exit(code); };

if (!opt.from && (!process.env.LT_USERNAME || !process.env.LT_ACCESS_KEY)) {
  const msg = "LT_USERNAME / LT_ACCESS_KEY are not set (environment or gitignored .env).";
  fail(`${msg} Set them to run the mandatory Kane gate.`);
}
const has = cmd => spawnSync("bash", ["-lc", `command -v ${cmd}`], {stdio: "ignore"}).status === 0;
if (!has("kane-cli")) fail("kane-cli is not on PATH. Install it with: npm install -g @testmuai/kane-cli@0.10.6");

// Log in without echoing the key. A stored profile is reused when whoami already works.
if (!opt.from && spawnSync("kane-cli", ["whoami"], {stdio: "ignore"}).status !== 0) {
  const r = spawnSync("kane-cli", ["login", "--username", process.env.LT_USERNAME, "--access-key", process.env.LT_ACCESS_KEY], {stdio: ["ignore", "ignore", "pipe"]});
  if (r.status !== 0) fail("kane-cli login failed. Check LT_USERNAME / LT_ACCESS_KEY.");
}
const balance = () => {
  const r = spawnSync("kane-cli", ["balance"], {encoding: "utf8"});
  const m = `${r.stdout}${r.stderr}`.match(/Available credits:\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
};

// ---------- app ----------
let server = null;
async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 750));
  }
  return false;
}
async function startApp() {
  if (opt.build) {
    log("Building the app (npm run build)…");
    const b = spawnSync("npm", ["run", "build"], {cwd: ROOT, stdio: ["ignore", "inherit", "inherit"]});
    if (b.status !== 0) {
      writeReports({status: "error", baseUrl: null, error: "npm run build failed, so Kane could not run. Fix the build error above first.", members: []});
      process.exit(1);
    }
  }
  const base = `http://127.0.0.1:${opt.port}`;
  log(`Starting next start on ${base}…`);
  server = spawn("npx", ["next", "start", "-p", String(opt.port), "-H", "127.0.0.1"], {cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], detached: true});
  if (!(await waitFor(`${base}/demo`, 60_000))) fail(`The app did not answer on ${base}/demo within 60s.`);
  return base;
}
function stopApp() { if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch {} server = null; } }
process.on("exit", stopApp);
process.on("SIGINT", () => { stopApp(); process.exit(130); });

// ---------- likely files ----------
const ROUTE_FILES = {
  "/demo": ["src/app/demo/page.tsx", "src/lib/policy-circuit.ts", "src/lib/demo-config.ts"],
  "/xlayer": ["src/app/xlayer/page.tsx", "src/components/rails-console.tsx", "src/lib/tapeout.ts", "src/lib/chains.ts"],
  "/rails": ["src/app/rails/page.tsx", "src/lib/rails.ts"],
  "/receipts": ["src/app/receipts/page.tsx", "src/lib/file-receipts.mjs"],
  "/": ["src/app/page.tsx", "src/components/landing.tsx"],
};
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (!["__tests__", "node_modules"].includes(e)) walk(p, out); }
    else if (/\.(tsx?|mjs|css)$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}
function likelyFiles(route, rawPhrases) {
  const phrases = rawPhrases.map(p => String(p).trim()).filter(p => p.length >= 4 && /[A-Za-z]{4}/.test(p) && !/^(true|false|null|none)$/i.test(p));
  const files = new Set(ROUTE_FILES[route] ?? ROUTE_FILES["/"]);
  const hits = new Map();
  const src = walk(path.join(ROOT, "src"));
  for (const phrase of phrases) {
    if (!phrase || phrase.length < 4 || !/[A-Za-z]{3}/.test(phrase) || /^(true|false|null)$/i.test(phrase)) continue;
    for (const f of src) {
      const text = readFileSync(f, "utf8");
      if (text.includes(`"${phrase}"`) || text.includes(`>${phrase}<`) || text.includes(`'${phrase}'`)) {
        const rel = path.relative(ROOT, f);
        const lines = text.split("\n").map((l, i) => (l.includes(phrase) ? i + 1 : 0)).filter(Boolean);
        hits.set(rel, [...new Set([...(hits.get(rel) ?? []), ...lines])]);
      }
    }
  }
  return {byRoute: [...files].filter(f => existsSync(path.join(ROOT, f))), byPhrase: [...hits].map(([file, lines]) => ({file, lines: lines.sort((a, b) => a - b).slice(0, 12), phrases: phrases.filter(p => p.length >= 4 && /[A-Za-z]{3}/.test(p) && readFileSync(path.join(ROOT, file), "utf8").includes(p))}))};
}

// ---------- parse one member's Kane session ----------
function readNdjson(file) {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
}
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const l of m[1].split("\n")) { const kv = l.match(/^(\w+):\s*(.*)$/); if (kv) fm[kv[1]] = kv[2]; }
  const title = (text.match(/^#\s+(.+)$/m) || [])[1] ?? "";
  const body = text.replace(/^---[\s\S]*?---/, "").replace(/^#\s+.+$/m, "").trim();
  return {fm, title, body};
}
function quoted(s) { return [...String(s ?? "").matchAll(/["\u201c]([^"\u201c\u201d]{2,80})["\u201d]/g)].map(m => m[1]); }
// Capitalised UI words Kane names in its verdict, e.g. "shows Refused in the status".
function uiWords(s) { return [...String(s ?? "").matchAll(/\b(?:shows?|says?|reads?|word|presents? \w+ \w+ as)\s+["\u201c]?([A-Z][a-z]+(?: [a-z]+){0,2})/g)].map(m => m[1]); }

function memberReport(member, events) {
  const src = path.join(ROOT, "tests/kane", path.basename(member.path));
  const {fm, title, body} = existsSync(src) ? frontmatter(readFileSync(src, "utf8")) : {fm: {}, title: "", body: ""};
  const done = [...events].reverse().find(e => e.type === "test_md_done") ?? {};
  const summary = [...events].reverse().find(e => e.type === "test_md_summary") ?? {};
  const runEnd = [...events].reverse().find(e => e.type === "run_end") ?? {};
  const memory = runEnd?.context?.memory ?? {};
  const checks = Object.entries(memory).map(([key, m]) => ({
    key, check: m.human_description || m.condition || key, condition: m.condition ?? null,
    expected: m.must_be ? `${m.subject ?? ""} ${m.must_be}`.trim() : m.expected_value ?? null,
    expectedValue: m.expected_value ?? null, actual: m.extracted_value ?? null,
    passed: /->\s*PASS\s*$/.test(m.reasoning ?? "") ? true : /->\s*FAIL\s*$/.test(m.reasoning ?? "") ? false : null,
  }));
  const status = done.overall_status ?? summary.overall_status ?? member.status ?? "unknown";
  const failingStep = runEnd.reason ?? null;
  const route = (() => { try { return new URL(String(fm.url ?? "").replace(MARKER, "http://x")).pathname || "/"; } catch { return "/"; } })();
  // Prefer what Kane says went wrong; fall back to the test's own quoted phrases.
  const verdict = [failingStep, runEnd.one_liner, runEnd.summary].join("\n");
  let phrases = [...new Set([...quoted(verdict), ...uiWords(verdict), ...checks.filter(c => c.passed === false).flatMap(c => [...quoted(c.condition), String(c.actual ?? "")])])];
  if (!phrases.length) phrases = quoted(body);
  return {
    test: `tests/kane/${path.basename(member.path)}`, title, route, status,
    durationS: done.duration_s ?? member.duration_s ?? null,
    shareUrl: done.share_url ?? summary.share_url ?? null,
    sessionId: done.session_id ?? member.session_id ?? null,
    objective: body,
    failingStep: status === "passed" ? null : failingStep,
    kaneDiagnosis: status === "passed" ? null : (runEnd.one_liner ?? null),
    kaneSummary: status === "passed" ? null : (runEnd.summary ?? null),
    checks,
    likelyFiles: status === "passed" ? null : likelyFiles(route, phrases),
  };
}

// ---------- reports ----------
function writeReports(r) {
  mkdirSync(KANE_DIR, {recursive: true});
  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {cwd: ROOT, encoding: "utf8"}).stdout.trim() || null;
  const dirty = spawnSync("git", ["status", "--porcelain", "--", "src"], {cwd: ROOT, encoding: "utf8"}).stdout.trim() !== "";
  const report = {tool: "kane-gate", kaneCli: spawnSync("kane-cli", ["--version"], {encoding: "utf8"}).stdout.trim() || null, generatedAt: new Date().toISOString(), commit, srcDirty: dirty, ...r,
    totals: {total: r.members.length, passed: r.members.filter(m => m.status === "passed").length, failed: r.members.filter(m => m.status !== "passed").length}};
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(REPORT_MD, renderMarkdown(report));
  return report;
}
function renderMarkdown(r) {
  const L = [];
  const ok = r.status === "passed";
  L.push(`# Kane gate report: ${ok ? "PASS ✅" : r.status === "error" ? "ERROR ⚠️" : "FAIL ❌"}`, "");
  L.push(`- Generated: ${r.generatedAt} by \`npm run kane:gate\` (kane-cli ${r.kaneCli ?? "?"})`);
  L.push(`- Commit: \`${r.commit ?? "?"}\`${r.srcDirty ? " (with uncommitted changes in src/)" : ""}`);
  if (r.baseUrl) L.push(`- Target: ${r.baseUrl}`);
  L.push(`- Result: ${r.totals.passed}/${r.totals.total} Kane tests passed`);
  if (r.credits && r.credits.before != null && r.credits.after != null) L.push(`- Kane credits used: ${(r.credits.before - r.credits.after).toFixed(1)} (left: ${r.credits.after.toFixed(1)})`);
  L.push("");
  if (r.error) L.push(`**Setup error:** ${r.error}`, "");
  L.push("| Test | Result | Kane run |", "|---|---|---|");
  for (const m of r.members) L.push(`| \`${m.test}\` ${m.title ? `· ${m.title}` : ""} | ${m.status === "passed" ? "✅ passed" : `❌ ${m.status}`} | ${m.shareUrl ? `[open in Kane](${m.shareUrl})` : "n/a"} |`);
  L.push("");
  if (ok) {
    L.push("All Kane checks are green. The change is cleared to push and deploy.", "");
    return L.join("\n");
  }
  L.push("## Fix request for the coding agent", "");
  L.push("You are the coding agent on Rails Desk. Kane CLI ran the browser tests below against the app and at least one failed. The gate exits non-zero, so push and deploy stay blocked until it is green.", "");
  L.push("Do this:", "1. Read each failure below: Kane's failing step, the expected vs actual values, and Kane's diagnosis.", "2. Decide whether the **app** is wrong (fix the code) or the **test** is wrong (Kane's diagnosis says the test checked the wrong place, or the requirement changed). Never weaken an assertion just to get green.", "3. Make the smallest fix in the files listed, then run `npm test` and `npm run build`.", "4. Run `npm run kane:gate` again and repeat until this report says PASS.", "");
  for (const m of r.members.filter(x => x.status !== "passed")) {
    L.push(`### ❌ ${m.title || m.test}`, "");
    L.push(`- Test file: \`${m.test}\` (route \`${m.route}\`)`);
    if (m.shareUrl) L.push(`- Kane run (video, steps, screenshots): ${m.shareUrl}`);
    L.push(`- Failing step: ${m.failingStep ?? "(Kane gave no step; open the run)"}`);
    if (m.kaneDiagnosis) L.push(`- Kane's diagnosis: ${m.kaneDiagnosis}`);
    L.push("");
    L.push("What the test requires:", "", "> " + m.objective.replace(/\n+/g, "\n> "), "");
    if (m.checks.length) {
      L.push("| Check | Expected | Actual (seen by Kane) | Result |", "|---|---|---|---|");
      for (const c of m.checks) L.push(`| ${c.check} | ${String(c.expected ?? "").replace(/\|/g, "\\|")} | ${String(c.actual ?? "").replace(/\|/g, "\\|")} | ${c.passed === true ? "pass" : c.passed === false ? "**FAIL**" : "?"} |`);
      L.push("");
    }
    if (m.kaneSummary) L.push("Kane's full summary:", "", "> " + m.kaneSummary.replace(/\n+/g, "\n> "), "");
    if (m.likelyFiles) {
      L.push("Files likely involved:");
      for (const f of m.likelyFiles.byPhrase) L.push(`- \`${f.file}\` lines ${f.lines.join(", ")} (contains ${f.phrases.map(p => `"${p}"`).join(", ")})`);
      for (const f of m.likelyFiles.byRoute.filter(f => !m.likelyFiles.byPhrase.some(p => p.file === f))) L.push(`- \`${f}\` (renders ${m.route})`);
      L.push("");
    }
  }
  return L.join("\n");
}

// ---------- main ----------
function finish(stdoutLines, code, baseUrl, credits) {
  const events = stdoutLines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
  const ends = events.filter(e => /member_end$/.test(e.type));
  const members = ends.map(e => memberReport(e, readNdjson(e.log_path)));
  // Members that never reported an end (crash) count as failures.
  for (const p of events.find(e => e.type === "testrun_plan")?.members ?? []) {
    if (!ends.some(e => path.basename(e.path) === path.basename(p.path))) members.push({test: `tests/kane/${path.basename(p.path)}`, title: "", route: "/", status: "not run", shareUrl: null, objective: "", failingStep: "Kane did not finish this test (crash or timeout).", checks: [], likelyFiles: null});
  }
  const done = events.find(e => e.type === "testrun_done");
  const status = members.length && members.every(m => m.status === "passed") && (done?.overall_status ?? "passed") === "passed" && code === 0 ? "passed" : "failed";
  const report = writeReports({status, baseUrl, executionId: done?.execution_id ?? null, kaneExitCode: code, credits, members});
  log(`${status === "passed" ? "PASS" : "FAIL"}: ${report.totals.passed}/${report.totals.total} Kane tests passed. Report: KANE_REPORT.md`);
  for (const m of members) if (m.shareUrl) log(`  ${m.status.padEnd(7)} ${m.test} → ${m.shareUrl}`);
  process.exit(status === "passed" ? 0 : 1);
}
if (opt.from) {
  const lines = readFileSync(opt.from, "utf8").split("\n").filter(Boolean);
  const done = lines.map(l => { try { return JSON.parse(l); } catch { return {}; } }).find(e => e.type === "testrun_done");
  finish(lines, done?.overall_status === "passed" ? 0 : 1, opt.url, null);
}
const before = balance();
const baseUrl = (opt.url ? opt.url : await startApp()).replace(/\/$/, "");
const work = mkdtempSync(path.join(tmpdir(), "rails-desk-kane-gate-"));
mkdirSync(path.join(work, "tests/kane"), {recursive: true});
mkdirSync(path.join(work, ".testmuai"), {recursive: true});
if (existsSync(path.join(ROOT, ".testmuai/context.md"))) copyFileSync(path.join(ROOT, ".testmuai/context.md"), path.join(work, ".testmuai/context.md"));
let files = readdirSync(path.join(ROOT, "tests/kane")).filter(f => f.endsWith("_test.md")).sort();
if (opt.match) files = files.filter(f => new RegExp(opt.match).test(f));
if (!files.length) fail("No Kane tests matched.");
for (const f of files) {
  const text = readFileSync(path.join(ROOT, "tests/kane", f), "utf8");
  if (!text.includes(MARKER)) fail(`tests/kane/${f} must start at ${MARKER}/… so the gate can point it at the target.`);
  writeFileSync(path.join(work, "tests/kane", f), text.replaceAll(MARKER, baseUrl));
}
log(`Running ${files.length} Kane test(s) against ${baseUrl}: ${files.join(", ")}`);
const runDir = path.join(KANE_DIR, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(runDir, {recursive: true});
const args = ["testrun", "run", ...files.map(f => `tests/kane/${f}`), "--headless", "--agent", "--on-failure", "continue", "--parallel", "1", "--name", opt.name ?? process.env.KANE_RUN_NAME ?? "Rails Desk Kane gate"];
if (opt.tags) args.push("--tags", opt.tags);
const stdoutLines = [];
const code = await new Promise(resolve => {
  const p = spawn("kane-cli", args, {cwd: work, stdio: ["ignore", "pipe", "pipe"]});
  let buf = "";
  p.stdout.on("data", d => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      stdoutLines.push(line);
      try {
        const e = JSON.parse(line);
        if (/member_start$/.test(e.type)) log(`▶ ${path.basename(e.path)}`);
        if (/member_end$/.test(e.type)) log(`${e.status === "passed" ? "✔" : "✘"} ${path.basename(e.path)} (${e.status}, ${e.duration_s}s)`);
      } catch {}
    }
  });
  p.stderr.on("data", () => {}); // Kane's TUI chatter; the NDJSON stream is the source of truth
  p.on("close", resolve);
});
writeFileSync(path.join(runDir, "kane-stdout.ndjson"), stdoutLines.join("\n") + "\n");
stopApp();

rmSync(work, {recursive: true, force: true});
finish(stdoutLines, code, baseUrl, {before, after: balance()});
