# Monitoring Plan Builder

A monitoring-plan builder for NRC country offices. Describe the intervention or start from the logframe, confirm the outcome indicators, plan who to ask, how and when, and generate the data-collection instruments (XLSForm for NRC Collect, Word and PDF) from an approved, versioned content bank.

**Live site:** https://shivaershadi.github.io/monitoring-plan-builder/

## No AI, no server, no secrets

- **No language model anywhere.** No file calls a model, a translation service or any third-party API. Every plan, sample size and instrument is built by deterministic, unit-tested engines from the content bank, so the same inputs always give the same outputs.
- **A static site.** The build is one HTML file, one JavaScript bundle and one stylesheet, with the bank compiled in. It is hosted on GitHub Pages; there is no backend, database or account.
- **No beneficiary data.** Project files hold programme settings only. They stay in the browser (IndexedDB) and leave it only as files the user downloads.
- **No secrets.** No API key, token or password is stored in the repository, the build, the hosting settings or the browser. The only network call the app may ever make is the optional, user-initiated push of a form to NRC Collect (`src/integrations/`, planned for phase 5), with a token the user pastes for one session and that is never stored.

CI enforces the first and last points: the build fails if `src`, `bank`, `index.html` or `vite.config.ts` mention a model provider or a key variable, or if any file outside `src/integrations/` makes a network call.

## Status

Phase 0 (repository, hosting, pipeline). The seed is the phase 0 foundations of the earlier AI-hybrid design, with the AI proxy removed:

- **Bank schema v2** (`bank/schema/bank.ts`, zod) with cross-reference validation and emitted JSON Schemas.
- **Emergency Shelter package** (`bank/packages/ss-emergency-shelter.json`, release 2026.10.0): 5 mandatory indicators supported, 7 suggested indicators listed as not yet supported, 6 standard activities.
- **Engines** with unit tests: timing parser, sampling, visit planner, XLSForm lint.
- **App shell** (React, Vite, Tailwind): Bank view and a Visits sandbox.

Phases 1 to 5 (Plan, Build, Review, Adviser, Pilot) and what has been tested are tracked in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Run locally

Needs Node 22 or later (CI uses Node 24).

```bash
npm install
npm run dev
```

Checks, as run by CI before every deployment:

```bash
npm run lint
npm test
npm run bank:validate
npm run build
```

`npm run preview` serves the built `dist/` folder. Opening `dist/index.html` directly from disk does not work, because the bundle is a JavaScript module and browsers block modules loaded from `file://`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, validates and builds the site and publishes `dist/` to GitHub Pages. `.github/workflows/ci.yml` runs the same checks plus the no-AI and no-network guard on every push and pull request. Dependabot proposes npm and Actions updates monthly.

`main` is protected by a ruleset: the CI job `check` must pass on a commit before `main` accepts it, and force pushes and deletion are blocked. Push changes to a branch, let CI pass, then fast-forward `main` or merge a pull request.

To publish a new bank release, commit the package, bump `bank/releases/current.json`, and push; the pipeline validates and ships it.

## Layout

```
bank/
  schema/bank.ts            zod schema v2 + validateBankPackage()
  schema/json/              emitted JSON Schemas
  source/                   v1 inputs (prototype content, country tables)
  scripts/                  convert, validate, emit-schema
  packages/                 v2 packages (generated or authored)
  releases/current.json     release manifest
src/
  engine/                   pure TypeScript engines + tests
  bank/loader.ts            loads the bundled release
  views/                    Bank view, Visits sandbox
docs/
  PROGRESS.md               what is done, what was tested, what is next
  BUILD_INSTRUCTION_v2.md   screen-by-screen spec inherited from the AI-hybrid design (reference)
.github/
  workflows/ci.yml          lint, tests, bank validation, build, no-AI guard
  workflows/deploy.yml      build and publish to GitHub Pages
  dependabot.yml            monthly npm and Actions updates
```

## Conventions

- Content is data: no indicator-specific code in `src/`. If a renderer needs a rule, add it to the schema and the package.
- `item_id` values are stable forever and snake_case; option values are codes, never labels.
- Every engine is pure and unit-tested; the UI only calls engines.
- Locked content is read-only for country offices; every edit of an adaptable item is logged in the project file.
- No beneficiary data, ever.
- `npm run lint`, `npm test`, `npm run bank:validate` and `npm run build` pass before every commit.

## Provenance

The first three commits are the phase 0 foundations of Outcome Monitoring Studio, an AI-hybrid design of the same tool. This repository continues from them without any AI component. The string review states keep a `machine` value and assists go through a single provider interface that ships with no provider, so an AI phase could be added later without changing the engines, if the organisation ever decides to.
