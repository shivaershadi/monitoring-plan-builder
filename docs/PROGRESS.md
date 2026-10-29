# Progress

Running record of what is built, what the product owner tested, and what is next. Newest entries first within each phase.

| Phase | Scope | State |
|---|---|---|
| 0 Repository, hosting, pipeline | Seed without AI, CI, Pages deployment, Dependabot, branch ruleset | Done; acceptance test passed 2026-10-29, awaiting product-owner sign-off |
| 1 Plan | Project document and autosave, Home, intervention canvas, logframe import, indicator board, visit planner | Not started |
| 2 Build | Parameters and context, assembler, XLSForm, Word and PDF writers, methodology note, enumerator briefing, package export | Not started |
| 3 Review | Workbench, edit log, glossary, translation memory, review pack, readiness checks, assist interface with no provider | Not started |
| 4 Adviser | Bank browser, toolkit import, authoring queue; WASH Water and Education PSS packages | Not started |
| 5 Pilot | Fixes from NRC Collect import tests; optional NRC Collect push | Not started |

## How changes reach the live site

`main` is protected by the ruleset "Protect main": no deletion, no force push, and the CI job `check` must have passed on a commit before `main` accepts it. Changes are pushed to a side branch first; CI runs there; once it is green the same commit is moved onto `main` (fast-forward push or pull request merge), and the deploy workflow publishes it.

## Phase 0: repository, hosting, pipeline

**Acceptance:** a change pushed to `main` reaches https://shivaershadi.github.io/monitoring-plan-builder/ within five minutes with CI green; the Bank screen shows release 2026.10.0 with 12 Emergency Shelter indicators; `npm test` passes in CI on Node 24.

### Acceptance result (2026-10-29)

| Check | Result |
|---|---|
| Push to `main` reaches the live site within five minutes with CI green | Commit `a2c17c2` pushed 21:53:53 UTC; CI and "Deploy to GitHub Pages" both completed successfully by 21:54:36 UTC (43 seconds) |
| `npm test` passes in CI on Node 24 | 17 tests in 4 files pass in the CI `check` job (Node 24, `ubuntu-latest`) |
| Live site left rail | "Bank v2026.10.0 · 1 package · 12 indicators" |
| Bank screen | One table, 12 rows: 5 mandatory indicators supported, 7 suggested not yet supported |
| Browser console | No messages on the Visits and Bank screens |
| Network | Only the page, one JS and one CSS file from `shivaershadi.github.io`; no other request. The published JS has the same content hash as the local build |
| Branch ruleset | "Protect main", active, default branch: deletion restricted, force push blocked, required status check `check` (GitHub Actions) |
| Issues | On |

### Done

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
- First push of `main` (commit `e3757ce`). CI run 1 passed on Node 24; deploy run 1 built and tested, then stopped at `configure-pages` because Pages was not yet enabled (expected). Dependabot ran at once and opened pull requests #1 to #5 (typescript-eslint, plugin-react, postcss, zod 4, vitest 5); they are left open for the Phase 1 toolchain upgrade.
- Second push (`a2c17c2`) after Pages was enabled: the acceptance test above.

### Tested by the product owner

- Completed the Git Credential Manager sign-in for the first push.
- Set Settings, Pages, Source to GitHub Actions.
- Created the branch ruleset "Protect main".

### Known items carried into Phase 1

- `npm audit` reports advisories in the development toolchain (vite 5 dev server, vitest 2 and its tinypool and mocker dependencies, esbuild 0.21 under vite) and in zod 3 (memory exhaustion on oversized constrained collections, fixed in zod 4.6.6). None of the vite or vitest code ships in the site; zod does. The fixes are major upgrades (vite 8, vitest 5, zod 4, plugin-react 6), so they are the first commit of Phase 1, before the project-document schema is written in zod; Dependabot pull requests #1 to #5 are superseded by it. The non-breaking fix (`postcss-selector-parser`) is applied.
- npm 11 reports that esbuild's install script is not on an allow-list. The build does not need it, because esbuild ships its binary as a platform package.
- GitHub notes that `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19. No action needed; CI will show if anything changes.

### Next

Phase 1 (Plan), on the product owner's go-ahead. First commit: toolchain upgrade and the Dependabot pull requests.
