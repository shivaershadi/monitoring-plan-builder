/** Emits JSON Schema files from the zod definitions so non-TypeScript tools (and advisers' editors) can validate bank files. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { BankPackage, BankRelease, CountryTable, Proposal } from '../schema/bank'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../schema/json')
mkdirSync(out, { recursive: true })
const write = (name: string, schema: z.ZodType) =>
  // io 'input': bank files are inputs, so fields with defaults stay optional in the emitted schema.
  writeFileSync(resolve(out, name), JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2) + '\n', 'utf8')
write('bank-package.schema.json', BankPackage)
write('bank-release.schema.json', BankRelease)
write('proposal.schema.json', Proposal)
write('countries.schema.json', CountryTable)
console.log(`Wrote JSON schemas to ${out}`)
