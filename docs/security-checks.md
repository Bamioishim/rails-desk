# Historical free security and quality checks

This report records the free-check workflow result for source commit `eb5f4e134ce4711886e9e6ca4367978bf3dfbba1`. It is historical evidence, not a result for the current main commit or the X Layer retirement branch.

- GitHub Actions run: [#20](https://github.com/Bamioishim/rails-desk/actions/runs/45474117600)
- Vitest lockfile version: 4.1.12
- Unit tests: passed
- TypeScript: passed
- ESLint: passed
- Production build: passed
- Full npm audit: 0 vulnerabilities (critical 0, high 0, moderate 0, low 0)
- Production-only npm audit: 0 vulnerabilities (critical 0, high 0, moderate 0, low 0)

## Full audit findings

- None

The paid Kane browser suite was not invoked in that workflow. It remains manual-dispatch only.
