# Progress

Running record of what is built, what the product owner tested, and what is next. Newest entries first within each phase.

| Phase | Scope | State |
|---|---|---|
| 0 Repository, hosting, pipeline | Seed without AI, CI, Pages deployment, Dependabot, branch ruleset | In progress |
| 1 Plan | Project document and autosave, Home, intervention canvas, logframe import, indicator board, visit planner | Not started |
| 2 Build | Parameters and context, assembler, XLSForm, Word and PDF writers, methodology note, enumerator briefing, package export | Not started |
| 3 Review | Workbench, edit log, glossary, translation memory, review pack, readiness checks, assist interface with no provider | Not started |
| 4 Adviser | Bank browser, toolkit import, authoring queue; WASH Water and Education PSS packages | Not started |
| 5 Pilot | Fixes from NRC Collect import tests; optional NRC Collect push | Not started |

## Phase 0: repository, hosting, pipeline

**Acceptance:** a change pushed to `main` reaches https://shivaershadi.github.io/monitoring-plan-builder/ within five minutes with CI green; the Bank screen shows release 2026.10.0 with 12 Emergency Shelter indicators; `npm test` passes in CI on Node 24.

### Done (2026-10-29)

- Seeded from the Outcome Monitoring Studio phase 0 commit `454c1cc`, keeping its three commits; branch renamed `master` to `main`.
- Removed the AI proxy (`proxy/`), the dev-only model proxy block in `vite.config.ts`, the `@cloudflare/workers-types` dependency and its `tsconfig` entry, and the proxy lint and test targets.
- Renamed the package to `monitoring-plan-builder`, added `engines.node >=22`, renamed the app in the page title and left rail, rewrote `README.md`, marked `docs/BUILD_INSTRUCTION_v2.md` as the inherited reference spec.
- Added `.github/workflows/ci.yml` (lint, tests, bank validation, build, no-AI and no-network guard), `.github/workflows/deploy.yml` (GitHub Pages) and `.github/dependabot.yml` (npm and Actions, monthly).
- Action versions checked on each Releases page on 2026-10-29. Newer majors than the plan listed were current, and all run on Node 24 or are composite:

  | Action | Plan said | Used | Latest release |
  |---|---|---|---|
  | `actions/checkout` | v5 | v7 | v7.0.1, 2026-07-20 |
  | `actions/setup-node` | v5 | v7 | v7.1.0, 2026-10-08 |
  | `actions/configure-pages` | v6 | v6 | v6.0.0, 2026-03-25 |
  | `actions/upload-pages-artifact` | v4 | v5 | v5.0.0, 2026-04-10 |
  | `actions/deploy-pages` | v5 | v5 | v5.0.1, 2026-09-01 |

  The deploy job runs without a dependency cache, as the setup-node v7 documentation recommends for workflows with write permissions. Both workflows check out without persisting the token.
- Local checks on Node 24.20 and npm 11.19: lint clean; 17 tests in 4 files pass; bank `ss-emergency-shelter.json` 0 errors, 0 warnings; build produces one HTML, one CSS (10.5 kB) and one JS file (304 kB); the no-AI guard finds nothing.

- First push of `main` on 2026-10-29 (commit `e3757ce`). On GitHub: CI run 1 passed on Node 24; deploy run 1 built and tested, then stopped at `configure-pages` because Pages was not yet enabled (expected). Dependabot ran at once and opened pull requests #1 to #5 (typescript-eslint, plugin-react, postcss, zod 4, vitest 5); they are left open for the Phase 1 toolchain upgrade.
- Pages source set to GitHub Actions by the product owner. This commit is the first push after that, and is the acceptance test that a push to `main` reaches the live site.

### Known items carried into Phase 1

- `npm audit` reports advisories in the development toolchain (vite 5 dev server, vitest 2 and its tinypool and mocker dependencies, esbuild 0.21 under vite) and in zod 3 (memory exhaustion on oversized constrained collections, fixed in zod 4.6.6). None of the vite or vitest code ships in the site; zod does. The fixes are major upgrades (vite 8, vitest 5, zod 4), so they are planned as the first commit of Phase 1, before the project-document schema is written in zod. The non-breaking fix (`postcss-selector-parser`) is applied.
- npm 11 reports that esbuild's install script is not on an allow-list. The build does not need it, because esbuild ships its binary as a platform package.

### Tested by the product owner

- Completed the Git Credential Manager sign-in for the first push.
- Set Settings, Pages, Source to GitHub Actions.

### Next

1. Both workflows green on this push; live site shows Bank v2026.10.0, 1 package, 12 indicators.
2. Branch ruleset on `main` requiring the CI `check` job; Issues on (product owner).
