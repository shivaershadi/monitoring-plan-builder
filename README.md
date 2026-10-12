# Outcome Monitoring Studio (Product 2)

Monitoring-plan builder for NRC country offices: describe the intervention, confirm the indicators, plan who to ask, how and when, and generate the instruments from an approved, versioned content bank. Concept and design: `../ES Monitoring Tool (Claude Code)/docs/Product 2 - New app concept and design (2026-10-12).md`. UI reference: `.../docs/Product 2 - UI mockup.html`.

## Status: Phase 0 foundations (2026-10-12)

Done in this phase:

- **Bank schema v2** (`bank/schema/bank.ts`, zod) with cross-reference validation and emitted JSON Schemas (`bank/schema/json/`). Items carry respondent, mode, lock level, structured relevance, flag values and source; indicators carry timing rules, applicability to activities, bundles and support status; packages carry an activity catalogue.
- **Converter** from the prototype's v1 Emergency Shelter content to a v2 package (`npm run bank:convert` → `bank/packages/ss-emergency-shelter.json`): 5 mandatory indicators supported, 7 suggested indicators listed as not yet supported, 6 standard activities from the 2026 S&S interactive indicator finder, guided occupancy-counting choices.
- **Release manifest** `bank/releases/current.json` and validator (`npm run bank:validate`).
- **Engines** with unit tests (`npm test`): timing parser (`src/engine/timing.ts`), sampling (`sampling.ts`), visit planner (`planner.ts`), XLSForm lint (`xlsform-lint.ts`), date helpers.
- **App shell** (React + Vite + Tailwind): Bank view and a Visits sandbox that runs the planner end to end on the Emergency Shelter indicators.
- **AI proxy** (`proxy/`): Cloudflare Worker that holds the API key, counts tokens per day in KV and enforces a daily cap. Not deployed.

Not yet: intervention canvas, logframe import, indicator board, parameters and context, instrument assembler and XLSForm/Word writers, AI client, review workflow, package export, adviser import tool. See the concept document, section 12, for the phase plan.

## Run

```bash
npm install
npm run dev
```

Tests, bank checks and build:

```bash
npm test
npm run bank:validate
npm run build
```

AI calls in dev go through the Vite proxy; set `ANTHROPIC_API_KEY` in the shell environment before `npm run dev` (never in a `VITE_` variable, never in a file inside the repo). No AI calls exist yet in phase 0.

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
proxy/                      Cloudflare Worker AI proxy + wrangler.toml
```

## Deploying the proxy (test phase)

1. In Cloudflare: create a KV namespace, paste its id into `proxy/wrangler.toml`.
2. `cd proxy; npm install; npx wrangler secret put ANTHROPIC_API_KEY` (your personal Claude Developer Platform key; rotate any key that was ever in a client bundle).
3. Set `ALLOWED_ORIGIN` and `DAILY_TOKEN_CAP` in `wrangler.toml`; `npx wrangler deploy`.
4. Put Cloudflare Access (email OTP or password policy) in front of both the Pages site and the Worker route, or set `STUDIO_TOKEN` as a secret and send it from the app.
5. Deploy the app with Cloudflare Pages (`npm run build`, publish `dist/`), with the Worker routed on `/api/*` of the same hostname so the app keeps calling relative paths.

## Conventions

- Content is data: no indicator-specific code in `src/`. If a renderer needs a rule, add it to the schema and the package.
- `item_id` values are stable forever and snake_case; option values are codes, never labels.
- Every engine is pure and unit-tested; the UI only calls engines.
- No beneficiary data, ever. Project files hold programme settings only.
