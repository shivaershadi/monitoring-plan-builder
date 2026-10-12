/** Emits JSON Schema files from the zod definitions so non-TypeScript tools (and advisers' editors) can validate bank files. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { BankPackage, BankRelease, Proposal } from '../schema/bank'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../schema/json')
mkdirSync(out, { recursive: true })
const write = (name: string, schema: unknown) => writeFileSync(resolve(out, name), JSON.stringify(schema, null, 2) + '\n', 'utf8')
write('bank-package.schema.json', zodToJsonSchema(BankPackage, { name: 'BankPackage' }))
write('bank-release.schema.json', zodToJsonSchema(BankRelease, { name: 'BankRelease' }))
write('proposal.schema.json', zodToJsonSchema(Proposal, { name: 'Proposal' }))
console.log(`Wrote JSON schemas to ${out}`)
