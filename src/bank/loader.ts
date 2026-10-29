/**
 * Loads the current bank release. Packages are bundled at build time (static app, no backend).
 * When a backend exists, this module fetches releases instead; nothing else changes.
 */
import { BankRelease, validateBankPackage, validateCountryTable, type BankPackage, type CountryTable } from '@bank/schema/bank'
import releaseJson from '@bank/releases/current.json'
import ssEmergencyShelter from '@bank/packages/ss-emergency-shelter.json'
import countriesJson from '@bank/packages/countries.json'

const BUNDLED: Record<string, unknown> = {
  'packages/ss-emergency-shelter.json': ssEmergencyShelter,
  'packages/countries.json': countriesJson,
}

export interface Bank {
  release: BankRelease
  packages: BankPackage[]
  countries: CountryTable | null
  problems: string[]
}

let cache: Bank | null = null

export function loadBank(): Bank {
  if (cache) return cache
  const release = BankRelease.parse(releaseJson)
  const packages: BankPackage[] = []
  const problems: string[] = []
  for (const p of release.packages) {
    const raw = BUNDLED[p.file]
    if (!raw) {
      problems.push(`${p.file}: not bundled`)
      continue
    }
    const res = validateBankPackage(raw)
    if (!res.ok || !res.pkg) {
      problems.push(`${p.file}: ${res.issues.filter((i) => i.level === 'error').map((i) => `${i.where} ${i.message}`).join('; ')}`)
      continue
    }
    packages.push(res.pkg)
  }
  let countries: CountryTable | null = null
  if (release.countries_file) {
    const res = validateCountryTable(BUNDLED[release.countries_file])
    if (res.ok && res.table) countries = res.table
    else problems.push(`${release.countries_file}: ${res.issues.map((i) => `${i.where} ${i.message}`).join('; ')}`)
  }
  cache = { release, packages, countries, problems }
  return cache
}

export function allIndicators(bank: Bank) {
  return bank.packages.flatMap((p) => p.indicators.map((i) => ({ pkg: p, ind: i })))
}
