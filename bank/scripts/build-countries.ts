/**
 * Builds bank/packages/countries.json from the prototype's country tables in bank/source/.
 * Language names become ISO 639 codes (639-1 where one exists, else 639-3) so XLSForm columns
 * can be written as label::Name (code). Run: npm run bank:countries
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCountryTable, type CountryTable, type Language } from '../schema/bank'

const here = dirname(fileURLToPath(import.meta.url))
const src = (f: string) => JSON.parse(readFileSync(resolve(here, '../source', f), 'utf8'))
const OUT = resolve(here, '../packages/countries.json')

const languagesSrc = src('country_languages.json') as { countries: Record<string, string[]> }
const regionsSrc = src('country_regions.json') as Record<string, string[]>

const LANGUAGES: Record<string, Language> = {
  English: { code: 'en', name: 'English', rtl: false },
  Amharic: { code: 'am', name: 'Amharic', rtl: false },
  Arabic: { code: 'ar', name: 'Arabic', rtl: true },
  Bengali: { code: 'bn', name: 'Bengali', rtl: false },
  Burmese: { code: 'my', name: 'Burmese', rtl: false },
  Dari: { code: 'prs', name: 'Dari', rtl: true },
  French: { code: 'fr', name: 'French', rtl: false },
  Hausa: { code: 'ha', name: 'Hausa', rtl: false },
  Kurdish: {
    code: 'ku',
    name: 'Kurdish',
    rtl: false,
    note: 'Macrolanguage code. Sorani (ckb) is written right to left in Arabic script; Kurmanji (kmr) in Latin script. An adviser should split this when Iraq content is encoded.',
  },
  'Persian (Farsi)': { code: 'fa', name: 'Persian (Farsi)', rtl: true },
  Pashto: { code: 'ps', name: 'Pashto', rtl: true },
  Portuguese: { code: 'pt', name: 'Portuguese', rtl: false },
  Sango: { code: 'sg', name: 'Sango', rtl: false },
  Somali: { code: 'so', name: 'Somali', rtl: false },
  Spanish: { code: 'es', name: 'Spanish', rtl: false },
  Swahili: { code: 'sw', name: 'Swahili', rtl: false },
  Ukrainian: { code: 'uk', name: 'Ukrainian', rtl: false },
}

const missing = new Set<string>()
const countries = Object.entries(languagesSrc.countries).map(([name, langs]) => ({
  name,
  regions: regionsSrc[name] ?? [],
  languages: langs.map((l) => {
    if (!LANGUAGES[l]) missing.add(l)
    return LANGUAGES[l]?.code ?? l
  }),
}))
if (missing.size) {
  console.error(`No code for: ${[...missing].join(', ')}. Add them to LANGUAGES.`)
  process.exit(1)
}

const table: CountryTable = {
  schema_version: 1,
  version: '2026.10.1',
  note: 'English is always required and comes first. The languages per country are suggestions the app offers; users can add any language from the list. Regions are first-level administrative areas.',
  default_language: 'en',
  languages: Object.values(LANGUAGES).sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name))),
  countries: countries.sort((a, b) => a.name.localeCompare(b.name)),
}

const check = validateCountryTable(table)
for (const i of check.issues) console.log(`${i.level.toUpperCase()} ${i.where}: ${i.message}`)
if (!check.ok) process.exit(1)
writeFileSync(OUT, JSON.stringify(check.table, null, 2) + '\n', 'utf8')
console.log(`Wrote ${OUT}: ${table.countries.length} countries, ${table.languages.length} languages`)
