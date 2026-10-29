/**
 * Converts the v1 prototype content (bank/source/emergency_shelter.v1.json) into a bank v2 package.
 * Run: npm run bank:convert
 * Output: bank/packages/ss-emergency-shelter.json
 *
 * Deterministic. Adviser-facing decisions that the v1 file does not carry (modes, timing rules, flag values,
 * applicability, suggested-indicator stubs, guided occupancy choices) are set here explicitly and marked in
 * the package with source refs so an adviser can review them in the Bank screen.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBankPackage, type Activity, type BankPackage, type ChoiceList, type Indicator, type Item, type Module, type Parameter, type Relevance } from '../schema/bank'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../source/emergency_shelter.v1.json')
const OUT = resolve(here, '../packages/ss-emergency-shelter.json')

// ---------- v1 shapes (loose) ----------
interface V1Choice { name: string; en: string; fr?: string }
interface V1Q { name: string; type: string; list?: string; label: string; core?: boolean; relevant_note?: string; construct?: string; dimension?: string; item_param?: string; sub_questions?: V1Q[] }
interface V1Param { key: string; label: string; type: string; default?: unknown; required?: boolean; recommended?: string; range?: [number, number]; allowed?: number[]; guidance: string; max_months?: number; fixed_items?: string[]; fixed_item_hints?: string[]; default_added_items?: string[]; default_items?: string[]; options?: string[]; required_options?: string[]; recommended_options?: string[] }
interface V1Indicator {
  id: string; gors_uid: string; result: string; result_level: string; status: string; modality: 'any' | 'in-kind' | 'CVA'; title_template: string; encoded: boolean
  locked?: Record<string, unknown> & { calculation: { numerator: string; denominator: string; counting_rule: string } }
  parameters?: V1Param[]
  instruments?: { observation_interview: { respondent: string; intro?: string; questions: V1Q[]; disaggregation_questions: Array<{ name: string; type: string; list: string; label: string; for: string }>; numerator_rule_text: string }; kii_guide?: { respondent: string; purpose?: string; questions: Array<{ name: string; label: string }> } }
  choice_lists?: Record<string, V1Choice[]>
}
interface V1 { toc: { id: string; name: string; version: string; source_toolkit: string; note: string }; global_rules: Record<string, string>; indicators: V1Indicator[] }

const rawText = readFileSync(SRC, 'utf8')
const v1: V1 = JSON.parse(rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText) // v1 file carries a UTF-8 BOM

// ---------- Adviser decisions encoded here ----------
const SOURCE_REF = 'NRC S&S outcome monitoring toolkits – Emergency Shelter (2026)'
const OBS_ITEMS = new Set(['loc', 'quality', 'missing_standards', 'occupied', 'present', 'absence_reason'])
const RESULT_ID: Record<string, string> = {
  'Use of emergency shelter': 'r_es_use_of_shelter',
  'Use of shelter support as intended': 'r_es_use_shelter_support',
  'Use of household items as intended': 'r_es_use_hh_items',
}
const APPLICABILITY: Record<string, string[]> = {
  'GL-SB403/FL': ['es_whole_shelter'],
  'GL-SB201/FL': ['es_shelter_contribution'],
  'GL-SB901/FL': ['es_shelter_contribution'],
  'GL-SB702/FL': ['es_nfi_distribution'],
  'GL-SB922/FL': ['es_nfi_distribution'],
}
const BUNDLES: Record<string, Indicator['bundles']> = {
  'GL-SB201/FL': [{ indicator_id: 'GL-SB901/FL', relation: 'alternative_modality', note: 'Report at least one of the two, by modality.' }],
  'GL-SB901/FL': [{ indicator_id: 'GL-SB201/FL', relation: 'alternative_modality', note: 'Report at least one of the two, by modality.' }],
  'GL-SB702/FL': [{ indicator_id: 'GL-SB922/FL', relation: 'alternative_modality', note: 'Report at least one of the two, by modality.' }],
  'GL-SB922/FL': [{ indicator_id: 'GL-SB702/FL', relation: 'alternative_modality', note: 'Report at least one of the two, by modality.' }],
}
const FLAGS: Record<string, Record<string, string[]>> = {
  'GL-SB403/FL': { loc: ['a', 'b'], quality: ['excellent', 'good', 'improved_slight', 'improved_signif'], occupied: ['a', 'b'] },
}
const OCCUPANCY_CHOICES: Parameter = {
  key: 'occupancy_counting',
  label: 'Who counts as occupying the shelter?',
  type: 'choice',
  required: true,
  guidance: 'Decide which occupants count toward the numerator when the shelter is lived in by people other than, or in addition to, the original recipient household. Explanations draw on Sphere Shelter standard 2 and the toolkit counting rule; verify against the toolkit before locking.',
  default: 'original_or_with_others',
  choices: [
    { value: 'original_only', label: 'Only the original recipient household, living there alone', explanation: 'Strictest reading. A shelter shared with another household does not count.', source: 'Toolkit counting rule' },
    { value: 'original_or_with_others', label: 'Original recipients, alone or together with other people', explanation: 'Toolkit default: the shelter counts if the intended household lives there, even if others also do.', recommended: true, source: 'Toolkit counting rule (occupied = a or b)' },
    { value: 'any_displaced_household', label: 'Any displaced household living there permanently, including new occupants', explanation: 'Use only where secondary occupation is accepted practice and agreed with the cluster; document the reason in the methodology note.', source: 'Sphere Shelter standard 2, guidance on hosting and secondary occupancy (to verify)' },
  ],
}

const slug = (id: string) => id.toLowerCase().replace(/^gl-|^gs-/, '').replace(/[^a-z0-9]+/g, '_').replace(/_fl$/, '')

function mapParam(p: V1Param): Parameter {
  const type = (['duration', 'percent', 'integer', 'text', 'list', 'multiselect'].includes(p.type) ? p.type : 'text') as Parameter['type']
  const out: Parameter = { key: p.key, label: p.label, type, required: !!p.required, guidance: p.guidance }
  if (p.default !== undefined) out.default = p.default as Parameter['default']
  if (p.recommended) out.recommended = p.recommended
  if (p.range) out.range = p.range
  if (p.allowed) out.allowed = p.allowed
  if (p.max_months) out.max_months = p.max_months
  if (p.fixed_items) out.fixed_items = p.fixed_items
  if (p.fixed_item_hints) out.fixed_item_hints = p.fixed_item_hints
  if (p.default_added_items?.length || p.default_items?.length) out.default_items = p.default_added_items ?? p.default_items
  if (p.options) out.options = p.options
  if (p.required_options) out.required_options = p.required_options
  if (p.recommended_options) out.recommended_options = p.recommended_options
  return out
}

function parseRelevance(note: string | undefined, refPrefix: string, lists: Map<string, Set<string>>, listOf: (name: string) => string | undefined): Relevance | undefined {
  if (!note) return undefined
  const m = note.match(/if\s+([a-z_]+)\s*=\s*(.+?)\.?$/i)
  if (!m) return undefined
  const localName = m[1]
  const values = m[2].split(/\s*(?:,|\bor\b)\s*/i).map((v) => v.trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
  const list = listOf(localName)
  if (list) {
    const known = lists.get(list)
    const ok = values.every((v) => known?.has(v))
    if (!ok) return undefined
  }
  return { ref: `${refPrefix}_${localName}`, op: values.length > 1 ? 'in' : '=', values }
}

function convertItems(qs: V1Q[], prefix: string, lists: Map<string, Set<string>>, respondent: string, flags: Record<string, string[]>): Item[] {
  const listOf = (name: string) => qs.find((q) => q.name === name)?.list
  return qs.map((q): Item => {
    const base: Item = {
      item_id: `${prefix}_${q.name}`,
      type: q.type === 'item_observation_group' ? 'repeat_group' : (q.type as Item['type']),
      label: { en: q.label },
      respondent,
      mode: OBS_ITEMS.has(q.name) ? 'observation' : 'interview',
      core: !!q.core,
      lock: q.type === 'text' && !q.core ? 'free' : 'locked',
      visibility: 'respondent',
      source: { ref: SOURCE_REF },
    }
    if (q.list) base.list = q.list.startsWith('{') ? q.list : q.list
    if (q.construct) base.construct = q.construct
    if (q.dimension) base.dimension = q.dimension
    if (q.relevant_note) {
      base.relevant_note = q.relevant_note
      const rel = parseRelevance(q.relevant_note, prefix, lists, listOf)
      if (rel) base.relevant = rel
    }
    if (flags[q.name]) base.flag_values = flags[q.name]
    if (q.type === 'item_observation_group') {
      base.repeat_over_param = q.item_param
      const subPrefix = `${prefix}_item`
      base.sub_items = convertItems(q.sub_questions ?? [], subPrefix, lists, respondent, {})
      base.sub_items.forEach((s) => (s.mode = OBS_ITEMS.has(s.item_id.replace(`${subPrefix}_`, '')) ? 'observation' : 'interview'))
    }
    return base
  })
}

// ---------- Build package ----------
const choiceLists = new Map<string, ChoiceList>()
const listValues = new Map<string, Set<string>>()
for (const ind of v1.indicators) {
  for (const [id, opts] of Object.entries(ind.choice_lists ?? {})) {
    const cl: ChoiceList = { id, options: opts.map((o) => ({ name: o.name, label: o.fr ? { en: o.en, fr: o.fr } : { en: o.en } })) }
    const prev = choiceLists.get(id)
    if (prev && JSON.stringify(prev.options.map((o) => o.name)) !== JSON.stringify(cl.options.map((o) => o.name))) {
      // Same id, different options: suffix with the indicator so nothing is silently merged.
      const alt = `${id}_${slug(ind.id)}`
      choiceLists.set(alt, { ...cl, id: alt })
      listValues.set(alt, new Set(cl.options.map((o) => o.name)))
      ind.choice_lists![id] = opts.map((o) => ({ ...o }))
      ;(ind as unknown as { _renamed?: Record<string, string> })._renamed = { ...((ind as unknown as { _renamed?: Record<string, string> })._renamed ?? {}), [id]: alt }
      continue
    }
    choiceLists.set(id, cl)
    listValues.set(id, new Set(cl.options.map((o) => o.name)))
  }
}
// dynamic quality-standards list
choiceLists.set('quality_standards', { id: 'quality_standards', from_parameter: 'quality_standards', options: [{ name: 'placeholder', label: { en: 'Built from the quality_standards parameter' } }] })

const modules: Module[] = []
const identification: Module = {
  id: 'identification',
  kind: 'identification',
  title: { en: 'Identification' },
  respondent: 'household',
  mode: 'interview',
  items: [
    { item_id: 'hh_id', type: 'text', label: { en: 'Household / beneficiary ID' }, respondent: 'household', mode: 'interview', core: true, lock: 'locked', visibility: 'respondent', required: true, source: { ref: SOURCE_REF } },
  ],
}
const disaggregation: Module = {
  id: 'disaggregation',
  kind: 'disaggregation',
  title: { en: 'Respondent profile' },
  respondent: 'household',
  mode: 'interview',
  items: [],
}
const seenDis = new Set<string>()
for (const ind of v1.indicators) {
  for (const d of ind.instruments?.observation_interview.disaggregation_questions ?? []) {
    if (seenDis.has(d.name)) continue
    seenDis.add(d.name)
    disaggregation.items.push({ item_id: d.name, type: d.type as Item['type'], list: d.list, label: { en: d.label }, dimension: d.for, respondent: 'household', mode: 'interview', core: false, lock: 'locked', visibility: 'respondent', source: { ref: SOURCE_REF } })
  }
}
modules.push(identification, disaggregation)

const indicators: Indicator[] = []
for (const ind of v1.indicators) {
  const s = slug(ind.id)
  const renamed = (ind as unknown as { _renamed?: Record<string, string> })._renamed ?? {}
  const qs = (ind.instruments?.observation_interview.questions ?? []).filter((q) => q.name !== 'hh_id').map((q) => ({ ...q, list: q.list && renamed[q.list] ? renamed[q.list] : q.list, sub_questions: q.sub_questions?.map((sq) => ({ ...sq, list: sq.list && renamed[sq.list] ? renamed[sq.list] : sq.list })) }))
  const items = convertItems(qs, s, listValues, 'household', FLAGS[ind.id] ?? {})
  const mod: Module = {
    id: `ind:${s}`,
    kind: 'indicator',
    title: { en: ind.result },
    intro: ind.instruments?.observation_interview.intro ? { en: ind.instruments.observation_interview.intro } : undefined,
    respondent: 'household',
    mode: 'interview',
    items,
  }
  modules.push(mod)

  const params = (ind.parameters ?? []).map(mapParam).map((p) => (p.key === 'occupancy_edge_cases' ? OCCUPANCY_CHOICES : p))
  const windowKey = params.find((p) => p.key === 'occupancy_window' || p.key === 'recall_window')?.key
  const locked = ind.locked as Indicator['locked']
  indicators.push({
    id: ind.id,
    gors_uid: ind.gors_uid,
    toc: 'es',
    result: RESULT_ID[ind.result],
    level: 'Outcome',
    status: 'mandatory',
    modality: ind.modality,
    title_template: ind.title_template,
    support: 'supported',
    content_status: 'approved',
    measurement_kind: 'questionnaire',
    locked,
    parameters: params,
    timing: {
      anchor: ind.id === 'GL-SB403/FL' ? 'handover' : 'distribution',
      offset: { value: 1, unit: 'months' },
      window: { value: 1, unit: 'months' },
      parameter_key: windowKey,
      per_round: true,
      note: 'Measured once per distribution round, within the window set by the CO parameter.',
    },
    respondents: ['household', 'community_rep'],
    modules: [`ind:${s}`],
    guides: ind.instruments?.kii_guide
      ? [{ respondent: 'community_rep', mode: 'kii', purpose: ind.instruments.kii_guide.purpose, questions: ind.instruments.kii_guide.questions.map((q) => ({ id: `${s}_${q.name}`, label: { en: q.label } })) }]
      : [],
    bundles: BUNDLES[ind.id] ?? [],
    applicability: APPLICABILITY[ind.id] ?? [],
    numerator_rule_text: ind.instruments?.observation_interview.numerator_rule_text,
    sources: [{ ref: SOURCE_REF }],
  })
}

// Suggested ES outcome indicators from the 2026 interactive indicator finder: listed, not yet supported.
const SUGGESTED: Array<[string, string, string]> = [
  ['GS-SB712/FL', 'r_es_hh_needs_met', '% of households reporting that their most essential household needs are met within one month after provision of household NFIs (kits or CVA)'],
  ['GS-SB601/FL', 'r_es_info_useful', '% of information session participants who perceive the information received as useful'],
  ['GS-SB801/FL', 'r_es_knowledge', '% of participants reporting increased knowledge to operate/maintain emergency shelter following trainings'],
  ['GS-SB811/FL', 'r_es_skill_applied', '% of training participants who report / are observed applying the skills in which they were trained'],
  ['GS-SB411/FL', 'r_es_sufficient', '% of emergency shelter recipients reporting that shelter assistance was sufficient to meet their immediate shelter needs'],
  ['GS-SB421/FL', 'r_es_safe', '% of emergency shelter recipients reporting that they feel safe within their shelter at least one month after handover'],
  ['GS-SB442/FL', 'r_es_retain', '% of households who have retained their emergency shelter solution by the end of the FLR phase'],
]
for (const [id, result, title] of SUGGESTED) {
  indicators.push({
    id, toc: 'es', result, level: 'Outcome', status: 'suggested', modality: 'any', title_template: title,
    support: 'not_yet_supported', content_status: 'draft', measurement_kind: 'questionnaire',
    parameters: [], respondents: [], modules: [], guides: [], bundles: [], applicability: [], sources: [{ ref: 'S&S interactive indicator finder 2026' }],
    toolkit_link: 'S&S outcome monitoring toolkits - Emergency Shelter.docx',
  })
}

const results = [
  { id: 'r_es_use_of_shelter', toc: 'es', name: 'Use of emergency shelter', level: 'Outcome' as const },
  { id: 'r_es_use_shelter_support', toc: 'es', name: 'Use of shelter support as intended', level: 'Outcome' as const },
  { id: 'r_es_use_hh_items', toc: 'es', name: 'Use of household items as intended', level: 'Outcome' as const },
  { id: 'r_es_hh_needs_met', toc: 'es', name: 'Essential household needs are met', level: 'Outcome' as const },
  { id: 'r_es_info_useful', toc: 'es', name: 'Information is perceived as useful', level: 'Outcome' as const },
  { id: 'r_es_knowledge', toc: 'es', name: 'Improved knowledge on skills in which trained', level: 'Outcome' as const },
  { id: 'r_es_skill_applied', toc: 'es', name: 'Appropriate application of skill in which trained', level: 'Outcome' as const },
  { id: 'r_es_sufficient', toc: 'es', name: 'Emergency shelter is relevant, sufficient and timely', level: 'Outcome' as const },
  { id: 'r_es_safe', toc: 'es', name: 'People feel safe within their shelter and settlement', level: 'Outcome' as const },
  { id: 'r_es_retain', toc: 'es', name: 'Ability to retain emergency shelter solution', level: 'Outcome' as const },
]

// Activity catalogue: Menu 1 of the S&S interactive indicator finder 2026 ("primary areas of work").
// Synonyms are drafted for the deterministic free-text matcher (release 2026.10.1) and are to be confirmed by an S&S adviser.
const activities: Activity[] = [
  { id: 'es_nfi_distribution', label: 'Household NFI distribution (kits or CVA for household items)', toc: 'es', area_of_work: 'Household NFI distribution', modalities: ['in-kind', 'CVA'], anchors: ['distribution'], respondents: ['household'], unit: 'household', results: ['r_es_use_hh_items', 'r_es_hh_needs_met'], asks: ['modality', 'rounds', 'timing', 'population', 'location'],
    synonyms: ['NFI distribution', 'non-food items', 'household items', 'NFI kits', 'household kits', 'core relief items', 'kitchen sets', 'cooking sets', 'blankets', 'sleeping mats', 'mattresses', 'jerrycans', 'cash for NFIs', 'NFI vouchers'] },
  { id: 'es_whole_shelter', label: 'Emergency shelter provision (whole shelter solution)', toc: 'es', area_of_work: 'Emergency shelter provision', modalities: ['in-kind', 'CVA'], anchors: ['handover'], respondents: ['household', 'community_rep'], unit: 'household', results: ['r_es_use_of_shelter', 'r_es_sufficient', 'r_es_safe', 'r_es_retain'], asks: ['modality', 'timing', 'population', 'location', 'units'],
    synonyms: ['tents', 'family tents', 'emergency shelters', 'shelter units', 'refugee housing units', 'RHU', 'whole shelter', 'shelter provision', 'handover of shelters', 'cash for rent'] },
  { id: 'es_shelter_contribution', label: 'Material / cash / technical supervision contribution to emergency shelter', toc: 'es', area_of_work: 'Material/cash/technical supervision contribution', modalities: ['in-kind', 'CVA'], anchors: ['distribution'], respondents: ['household'], unit: 'household', results: ['r_es_use_shelter_support', 'r_es_sufficient', 'r_es_safe'], asks: ['modality', 'rounds', 'timing', 'population', 'location'],
    synonyms: ['tarpaulins', 'plastic sheeting', 'shelter kits', 'emergency shelter kits', 'shelter materials', 'construction materials', 'timber and rope', 'tool kits', 'cash for shelter', 'shelter cash', 'technical supervision', 'shelter repair'] },
  { id: 'es_training', label: 'Training and awareness-raising for temporary shelter', toc: 'es', area_of_work: 'Training & awareness-raising', modalities: ['any'], anchors: ['training_end'], respondents: ['individual'], unit: 'individual', results: ['r_es_knowledge', 'r_es_skill_applied'], asks: ['timing', 'population', 'location'],
    synonyms: ['shelter training', 'construction training', 'build back safer', 'safer construction', 'trained on shelter', 'shelter awareness'] },
  { id: 'es_information', label: 'Information sessions on emergency shelter topics', toc: 'es', area_of_work: 'Training & awareness-raising', modalities: ['any'], anchors: ['session_end'], respondents: ['individual'], unit: 'session', results: ['r_es_info_useful'], asks: ['timing', 'population', 'location'],
    synonyms: ['information sessions', 'shelter information', 'awareness sessions', 'community sessions', 'key messages'] },
  { id: 'es_energy', label: 'Provision of safe household energy', toc: 'es', area_of_work: 'Provision of household energy supply', modalities: ['in-kind', 'CVA'], anchors: ['distribution'], respondents: ['household'], unit: 'household', results: [], asks: ['modality', 'timing', 'population', 'location'],
    synonyms: ['fuel', 'firewood', 'cooking fuel', 'stoves', 'fuel-efficient stoves', 'cookstoves', 'briquettes', 'LPG', 'solar lamps', 'household energy'] },
]

const pkg: BankPackage = {
  schema_version: 2,
  package_id: 'ss-emergency-shelter',
  competency: { id: 'ss', name: 'Shelter & Settlements' },
  version: '2026.10.1',
  generated_from: 'emergency_shelter.v1.json (prototype content layer) via convert-v1-emergency-shelter.ts',
  global_rules: v1.global_rules,
  tocs: [{ id: 'es', name: v1.toc.name, version: v1.toc.version, source_toolkit: v1.toc.source_toolkit, note: v1.toc.note }],
  results,
  indicators,
  modules,
  choice_lists: [...choiceLists.values()],
  activities,
  glossary: [
    { term: 'emergency shelter', note: 'Temporary shelter solution expected to have only a temporary impact (FLR definition).' },
    { term: 'occupied', note: 'Lived in all or most days of the week as a principal residence.' },
    { term: 'habitable', note: 'Meets the CO-defined minimum standards aligned with Sphere.' },
  ],
}

const check = validateBankPackage(pkg)
for (const i of check.issues) console.log(`${i.level.toUpperCase()} ${i.where}: ${i.message}`)
if (!check.ok) {
  console.error('Package has errors; not written.')
  process.exit(1)
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(check.pkg, null, 2) + '\n', 'utf8')
console.log(`Wrote ${OUT}: ${pkg.indicators.length} indicators, ${pkg.modules.length} modules, ${pkg.choice_lists.length} choice lists, ${pkg.activities.length} activities`)
