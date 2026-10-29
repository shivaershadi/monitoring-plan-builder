# Progress

Running record of what is built, what the product owner tested, and what is next. Newest phase first.

| Phase | Scope | State |
|---|---|---|
| 0 Repository, hosting, pipeline | Seed without AI, CI, Pages deployment, Dependabot, branch ruleset | Accepted by the product owner, 2026-10-29 |
| 1 Plan | Project document and autosave, Home, intervention canvas, logframe import, indicator board, visit planner | Built; acceptance test passed in the browser 2026-10-30; awaiting product-owner test |
| 2 Build | Parameters and context, assembler, XLSForm, Word and PDF writers, methodology note, enumerator briefing, package export | Not started |
| 3 Review | Workbench, edit log, glossary, translation memory, review pack, readiness checks, assist interface with no provider | Not started |
| 4 Adviser | Bank browser, toolkit import, authoring queue; WASH Water and Education PSS packages | Not started |
| 5 Pilot | Fixes from NRC Collect import tests; optional NRC Collect push | Not started |

## How changes reach the live site

`main` is protected by the ruleset "Protect main": no deletion, no force push, and the CI job `check` must have passed on a commit before `main` accepts it. Changes are pushed to a working branch first (`phase-1` during Phase 1); CI runs there; once it is green the same commit is moved onto `main` (fast-forward push), and the deploy workflow publishes it.

## Phase 1: Plan

**Acceptance (plan section 5):** the Emergency Shelter example (three activities, five mandatory indicators, planner proposes events, user merges two, plan survives reload) passes end to end in the browser; merge and split reducers are unit-tested; a logframe pasted from the 2026 mandatory indicator list matches all five.

### Acceptance result (2026-10-30)

| Check | Result |
|---|---|
| Merge and split reducers unit-tested | `src/engine/visits.test.ts`: merge (later window when disjoint, overlap when overlapping, refused across respondents), split (own windows, undo of a merge, refused when one side would be empty), drop, move, edits on vanished visits reported |
| Logframe from the 2026 mandatory list matches all five | `src/engine/logframe.test.ts`: the five Emergency Shelter rows as copied from "Mandatory indicator list for projects starting in 2026.xlsx" match by ID; the same five match by title alone (Dice ≥ 0.6) |
| Engine-level example | `src/project/acceptance.test.ts`: three activities, five locked mandatory indicators, three proposed visits, merge of two, plan identical after a save and reload through the project file |
| Browser, local dev server | Created "Maiduguri emergency shelter 2026" (Nigeria, Borno; Hausa suggested and added). Typed "We gave out tarpaulins and rope": matched the shelter contribution activity. Added NFI distribution and shelter provision from the catalogue. Timings "1-10 Nov 2026", "1-20 Sep 2026", "15 January 2027" all understood. Coverage: 5 mandatory and 4 suggested indicators. Indicators screen: the five mandatory ticked and locked; a content request filed for GS-SB421/FL. Visits: three household visits (20 Oct–20 Nov 2026, n=292; 10 Dec 2026–10 Jan 2027, n=235; 15 Feb–15 Mar 2027, n=218), no warnings. Merged the first two: two visits, the merged one serving four indicators, with warnings that GL-SB702/FL and GL-SB922/FL fall outside their windows and the interview runs about 40 minutes. Reloaded the page twice (once with a dev-server restart): the app reopened on Visits with the merge, its undo entry and the warnings intact |
| Browser, logframe door | Pasted six lines: three matched by ID, one by GORS UID, one by title (85%), one "#" line reported as an output. The app listed the three activities the indicators need; adding the shelter contribution turned GL-SB201/FL and GL-SB901/FL into locked mandatory indicators |
| Reviewer mode | Every control on the plan screens disabled, with a note |
| Checks | Lint clean; 61 tests in 11 files; bank and country table valid; build: one HTML, one CSS (17 kB), main JS 423 kB (120 kB compressed) plus the spreadsheet reader (492 kB) loaded only on upload; no-AI guard clean; `npm audit` 0 vulnerabilities |

### Done

- **Toolchain** (commit `841024f`): vite 8, vitest 5, zod 4, @vitejs/plugin-react 6, typescript-eslint 8.72, typescript 5.9. JSON Schemas now emitted with zod 4's built-in converter. `npm audit` clean. Dependabot closed its pull requests #1 to #5 itself once this reached `main`.
- **Engines and project** (commit `6060088`):
  - Planner split into propose, apply edits, finish; stable visit keys; per-visit confidence, margin and strata; warnings for visits outside an indicator's window and for indicators left without a visit after a drop.
  - Visit edits (`src/engine/visits.ts`): merge, split, drop, move, replayed on every re-plan.
  - Indicator board (`src/engine/selection.ts`): applicability by activity and modality, mandatory locked, suggested, logframe origin, bundles, removal with note.
  - Logframe matcher (`src/engine/logframe.ts`) and activity synonym matcher (`src/engine/activityMatch.ts`), both deterministic.
  - Project document (`src/project/schema.ts`) with defaults for the fields later phases use; reducer; IndexedDB store; file import and export.
  - Bank release 2026.10.1: activity synonyms; country table (32 countries, regions, 17 languages with ISO codes and right-to-left flags).
- **Screens** (this commit): Home, Intervention, Indicators with logframe import, Visits, mode switch, autosave status, project export, reopen after reload.

### Decisions taken during the build

- **SheetJS 0.20.3 from the vendor's own server** instead of npm's 0.18.5. The npm build has two published advisories (prototype pollution, fixed in 0.19.3; regular-expression denial of service, fixed in 0.20.2), and the plan's risk table says to revisit the pin when an advisory appears. The download happens at install time only; the app makes no network call. Dependabot does not track this source, so the version is checked by hand at each phase.
- **Merging visits:** only visits with the same respondent and method can be merged (one visit, one instrument). The planner already joins same-respondent visits whose windows overlap, so a user merge usually joins disjoint windows; the merged visit takes the later window and the app flags each indicator measured outside its own window.
- **Splitting** moves chosen indicators to a second visit; each part gets the window its own indicators share.
- **The spreadsheet reader loads only when a file is uploaded**, so the first page load stays small. Phase 2's Word and PDF libraries will load the same way.
- **One plan per bank package**, concatenated. Correct while there is one package; Phase 4 must decide how shared modules (consent, identification) work across packages before a second package is added.

### Known items carried into Phase 2

- Activity synonyms (`bank/scripts/convert-v1-emergency-shelter.ts`) are drafted and need confirmation by an S&S adviser.
- The "rounds" field is stored but the planner still anchors on the last distribution date; per-round visits (timing rule `per_round`) are not planned yet.
- Indicator timing uses the bank default (1 month) until the Parameters screen in Phase 2 lets the country office set the recall or occupancy window.
- Warning texts show dates as YYYY-MM-DD while the rest of the screen uses "20 Oct 2026".
- "Request content" records are kept in the project file; the adviser's queue that reads them arrives in Phase 4.
- The country table's Kurdish entry uses the macrolanguage code `ku`; an adviser should split Sorani (`ckb`, right to left) and Kurmanji (`kmr`) when Iraq content is encoded.
- Adviser mode currently only shows a note; authoring arrives in Phase 4.

### Tested by the product owner

Pending. Suggested test on the live site: start a project through each door, add your own activities and dates, upload a real logframe spreadsheet, merge or split a visit, then reload the page and reopen the project.

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
- Renamed the package to `monitoring-plan-builder`, added `engines.node`, renamed the app in the page title and left rail, rewrote `README.md`, marked `docs/BUILD_INSTRUCTION_v2.md` as the inherited reference spec.
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
- First push of `main` (commit `e3757ce`); deploy run 1 stopped at `configure-pages` because Pages was not yet enabled (expected). Second push (`a2c17c2`) after Pages was enabled: the acceptance test above.

### Tested by the product owner

- Completed the Git Credential Manager sign-in for the first push.
- Set Settings, Pages, Source to GitHub Actions.
- Created the branch ruleset "Protect main".
- Accepted Phase 0 and approved the start of Phase 1 (2026-10-29).
