# Build instruction v2 — Outcome Monitoring Studio

Read first: `README.md` (what exists), then the concept `../ES Monitoring Tool (Claude Code)/docs/Product 2 - New app concept and design (2026-10-12).md` (why), then the mockup `.../docs/Product 2 - UI mockup.html` (how it should look). This file turns the concept into build phases with acceptance criteria. Phase 0 is done.

## Non-negotiables

1. Content is data. `src/` holds no indicator-specific code. If a renderer needs a rule, extend `bank/schema/bank.ts` and the package.
2. Assembly is deterministic. Instruments are built from the bank by engines in `src/engine/`; no model in that path.
3. AI outputs are proposals with a review state (machine, edited, approved, verified). AI never edits `item_id`, option values, relevance, calculation or a construct.
4. Locked content is read-only for country offices. Every edit of an `options_adaptable` or `free` item is logged in the project file.
5. No beneficiary data, no API key in the client. AI calls go to the relative path `/api/anthropic/...` (Vite proxy in dev, Cloudflare Worker in `proxy/` online).
6. Every engine has unit tests. `npm test`, `npm run bank:validate`, `npm run lint` and `npm run build` pass before every commit.
7. `item_id` and option values are stable forever and snake_case.

## Project document (state)

One JSON document per project, autosaved to IndexedDB and exportable as a file. Shape (extend `src/project/schema.ts` with zod):

- `meta`: id, name, country, area, languages (ordered, `en` first), bank_version, created, updated, version (integer, bumped on sign-off).
- `activities[]`: `PlannedActivity` from `src/engine/planner.ts` plus `raw_timing`, `modality`, `location`, `notes`.
- `indicators[]`: `{ id, origin: mandatory | suggested | logframe, state: selected | removed, removal_note? }`.
- `parameters`: `{ [indicator_id]: { [key]: value } }`.
- `context`: glossary, contact, data_protection_statement, consent config (verbal | written, under18 on/off), typologies, hazards.
- `events[]`: planner output plus user edits (`merged_from`, `window_override`, `dropped`).
- `strings`: `{ [item_id or option ref]: { [lang]: { text, status, reviewer?, date?, back_translation?, flags[] } } }`.
- `sign_off?`: name, date, comment, content_hash.

## Phase 1 — Plan (weeks 3–5)

Screens: Home (two doors), Intervention canvas, Logframe import, Indicator board, Visits.

- Home: recent projects from IndexedDB; "Describe your intervention" and "Start from your logframe"; mode switch (Builder / Reviewer / Adviser) stored in the project.
- Intervention canvas: country and area (from `bank/source/country_languages.json`, `country_regions.json`, to be moved into a `bank/packages/countries.json`); activity cards from the package activity catalogue; each card asks only its `asks` fields; timing via `parseTiming` with the "We understood" confirmation and a date picker fallback for `unresolved`.
- Logframe import: paste text or upload xlsx (SheetJS); match by indicator id (exact) then by title (normalised token overlap ≥ 0.6); table of matched / unmatched / unsupported; selected indicators flow into the board.
- Indicator board: results grouped by competency and TOC; mandatory pre-selected and locked; suggested optional; `alternative_modality` bundles resolved from the activity modality; greyed `not_yet_supported` with "Request content" that writes a `Proposal` record (status `requested`).
- Visits: timeline by month × respondent rows from `planEvents`; actions merge, split, drop, move (user edits stored in `events[]` and re-applied after re-planning); warnings panel; sample size per event with confidence and margin controls; stratification option.

Acceptance: the Borno school example from the mockup cannot be built yet (no Education or WASH packages), so use the Emergency Shelter package: three activities, five mandatory indicators, planner proposes events, user merges two, the plan survives reload, and `npm test` covers the merge and split reducers.

## Phase 2 — Build (weeks 6–8)

- Parameters and context screen: guided parameter cards (`type: choice` renders explanations; `list` renders the item-list builder; `duration` renders a slider with the recommended range).
- Instrument assembler (`src/engine/assembler.ts`): for each event, order modules consent → identification → disaggregation → indicator modules → satisfaction/feedback; dedupe by `item_id`; expand `repeat_group` per configured list; resolve `{param}` placeholders; emit an `Instrument` document model shared by all writers.
- XLSForm writer (`src/engine/xlsform.ts`, SheetJS): `survey`, `choices`, `settings`; `label::Language (code)` per language; consent gating; calculates for `flag_values`; metadata rows; `settings.version` = `bank_version+project_version`; run `lintWorkbook` before download.
- Word and PDF writers over the same document model (reuse the prototype's `docx` and `pdfmake` code after its WP5 refactor; embed Noto fonts; RTL for Arabic-script languages).
- Methodology note: one indicator profile per indicator with parameters merged into locked text; event plan; sampling; timing.
- Enumerator briefing (PDF only, never in a form).
- Package screen: readiness summary, sign-off, zip download (`jszip`), project file.

Acceptance: a two-language Emergency Shelter package imports into NRC Collect (manual test by the user) with consent gating working; lint reports 0 errors; Word outputs open in Word with correct scripts.

## Phase 3 — Assist (weeks 9–10)

- AI client (`src/ai/client.ts`): typed tasks (`localise`, `translate`, `back_translate`, `probes`, `explain`, `map_activity`), request/response schemas validated with zod, cache keyed by hash(source, language, glossary_version, model), parallel queue with concurrency 4, per-call token accounting from the response.
- Instrument workbench: two-pane editor with language tabs, status chips, glossary highlighting, per-field assists, readiness panel with real checks (`src/engine/readiness.ts`, unit-tested).
- Review pack: export per language (xlsx) and import with status updates and reviewer name.

Acceptance: translating the Emergency Shelter package into two languages costs under one US dollar at current prices and regenerating after one edited string sends exactly one request per language.

## Phase 4 — Adviser (weeks 11–12)

- Bank browser (extend `src/views/BankView.tsx`), release changelog.
- Toolkit import tool (`bank/scripts/import-toolkit.ts` first, UI later): Word toolkit → draft package with the source paragraph attached to each field; adviser reviews in the app; publish bumps the package version.
- Proposal queue: AI draft from allowed sources with citations; adviser approve/reject; approved entries get `content_status: proposal_derived`.
- Encode WASH Water and Education PSS wellbeing as the first non-shelter packages.

## Phase 5 — Pilot (weeks 13–16)

Test with colleagues and one or two country offices; import test in NRC Collect; fix; encode ICLA, PfV, MPC.

## Known gaps carried from phase 0

- The Emergency Shelter modules keep observation items (location, quality, occupancy) inside the household interview module because the v1 instrument is one combined form. If the planner should separate facility observation events, split those items into a `mode: observation` module with `respondent: facility` during phase 2 and update `planner.test.ts`.
- Timing rules for the five ES indicators were set by the converter (1 month after handover or distribution, 1-month window, overridden by the CO window parameter). An adviser should confirm them in the Bank screen.
- Occupancy counting choices are drafted from the toolkit counting rule and Sphere; marked "to verify".
- `bank/source/country_*.json` are still the prototype's tables.
