/** Validates every package listed in bank/releases/current.json, and the country table. Run: npm run bank:validate */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BankRelease, validateBankPackage, validateCountryTable } from '../schema/bank'

const here = dirname(fileURLToPath(import.meta.url))
const releaseFile = resolve(here, '../releases/current.json')
const release = BankRelease.parse(JSON.parse(readFileSync(releaseFile, 'utf8')))
let failed = false
for (const p of release.packages) {
  const file = resolve(here, '..', p.file)
  const res = validateBankPackage(JSON.parse(readFileSync(file, 'utf8')))
  const errors = res.issues.filter((i) => i.level === 'error')
  const warnings = res.issues.filter((i) => i.level === 'warning')
  console.log(`${p.file}: ${res.ok ? 'OK' : 'FAILED'} (${errors.length} errors, ${warnings.length} warnings)`)
  for (const i of res.issues) console.log(`  ${i.level.toUpperCase()} ${i.where}: ${i.message}`)
  if (res.pkg && res.pkg.version !== p.package_version) {
    console.log(`  ERROR release lists version ${p.package_version} but package says ${res.pkg.version}`)
    failed = true
  }
  if (!res.ok) failed = true
}
if (release.countries_file) {
  const res = validateCountryTable(JSON.parse(readFileSync(resolve(here, '..', release.countries_file), 'utf8')))
  console.log(`${release.countries_file}: ${res.ok ? 'OK' : 'FAILED'} (${res.table?.countries.length ?? 0} countries, ${res.table?.languages.length ?? 0} languages)`)
  for (const i of res.issues) console.log(`  ${i.level.toUpperCase()} ${i.where}: ${i.message}`)
  if (!res.ok) failed = true
}
process.exit(failed ? 1 : 0)
