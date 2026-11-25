import { readReceiptFile } from "../../../lib/file-receipts.mjs";

const filePath = () => process.env.RAILS_DESK_RECEIPTS_FILE || undefined;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(await readReceiptFile(filePath()), { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the receipt log.";
    return Response.json({ error: message }, { status: 500, headers: noStore });
  }
}

/**
 * The file-backed receipt log is retained for legacy/demo history only.
 * Decisions are now handled by the authenticated Rails Desk API.
 */
export async function POST() {
  return Response.json(
    { error: "The legacy file-backed receipt endpoint is read-only." },
    { status: 405, headers: { ...noStore, Allow: "GET" } },
  );
}
