/**
 * Bank schema v2 — the approved, versioned content every country office assembles from.
 *
 * Design rules (Product 2 concept, section 5 and 11):
 *  - Content is data. The app contains no indicator-specific code; rules (timing, relevance, flags)
 *    are expressed here.
 *  - Lock levels are explicit per item. Country offices never edit locked content.
 *  - Every item carries respondent type and mode so the visit planner can group items into events.
 *  - Every indicator carries a timing rule relative to an activity milestone.
 *  - Support status distinguishes what the app can generate from what is only listed.
 */
import { z } from 'zod'

// ---------- Primitive vocabularies ----------

export const LangCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, 'ISO language code, e.g. en, fr, ar, prs')
export type LangCode = z.infer<typeof LangCode>

/** Multilingual string: 'en' is mandatory; other keys are language codes. */
export const LString = z
  .object({ en: z.string() })
  .catchall(z.string().optional())
export type LString = z.infer<typeof LString>

export const LockLevel = z.enum(['locked', 'options_adaptable', 'free'])
export type LockLevel = z.infer<typeof LockLevel>

export const Mode = z.enum(['interview', 'observation', 'kii', 'fgd', 'measurement'])
export type Mode = z.infer<typeof Mode>

export const Visibility = z.enum(['respondent', 'enumerator'])

/** Respondent types are an open vocabulary; these are the ones the planner knows how to label. */
export const KnownRespondent = z.enum([
  'household',
  'individual',
  'child',
  'caregiver',
  'teacher',
  'head_teacher',
  'committee',
  'community_rep',
  'service_provider',
  'facility',
  'site',
])
export const RespondentType = z.string().min(1)
export type RespondentType = z.infer<typeof RespondentType>

export const XlsType = z.enum([
  'note',
  'text',
  'integer',
  'decimal',
  'date',
  'select_one',
  'select_multiple',
  'geopoint',
  'image',
  'calculate',
  'repeat_group', // expanded per configured list item (v1 "item_observation_group")
])
export type XlsType = z.infer<typeof XlsType>

export const DurationUnit = z.enum(['days', 'weeks', 'months'])
export const Duration = z.object({ value: z.number().positive(), unit: DurationUnit })
export type Duration = z.infer<typeof Duration>

// ---------- Timing ----------

export const Anchor = z.enum([
  'activity_start',
  'activity_end',
  'handover',
  'distribution',
  'training_end',
  'session_end',
  'term_end',
  'custom',
])

/**
 * When to measure, relative to an activity milestone.
 * offset: how long after the anchor the window opens; parameter_key lets a CO parameter override it
 * (e.g. occupancy_window). window: how long the collection window stays open.
 */
export const TimingRule = z.object({
  anchor: Anchor,
  offset: Duration,
  window: Duration,
  parameter_key: z.string().optional(),
  per_round: z.boolean().default(false),
  note: z.string().optional(),
})
export type TimingRule = z.infer<typeof TimingRule>

// ---------- Relevance (structured; rendered to XLSForm `relevant` by the writer) ----------

export const Relevance = z.object({
  ref: z.string(), // item_id or local name within the same module
  op: z.enum(['=', '!=', 'in', 'not_in', 'selected']),
  values: z.array(z.string()).min(1),
})
export type Relevance = z.infer<typeof Relevance>

// ---------- Choices ----------

export const ChoiceOption = z.object({
  name: z.string().regex(/^[A-Za-z0-9_\-.]+$/, 'option value must be XLSForm-safe'),
  label: LString,
  /** Marks options that map into the indicator numerator (flag mapping). */
  counts: z.boolean().optional(),
})
export const ChoiceList = z.object({
  id: z.string(),
  options: z.array(ChoiceOption).min(1),
  /** Dynamic lists are built from a parameter (e.g. {quality_standards}). */
  from_parameter: z.string().optional(),
})
export type ChoiceList = z.infer<typeof ChoiceList>

// ---------- Parameters (CO-defined) ----------

export const ParameterType = z.enum(['duration', 'percent', 'integer', 'text', 'list', 'multiselect', 'choice'])

export const ChoiceExplained = z.object({
  value: z.string(),
  label: z.string(),
  explanation: z.string().optional(),
  recommended: z.boolean().optional(),
  source: z.string().optional(),
})

export const Parameter = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  type: ParameterType,
  required: z.boolean().default(false),
  guidance: z.string(),
  default: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
  recommended: z.string().optional(),
  range: z.tuple([z.number(), z.number()]).optional(),
  allowed: z.array(z.number()).optional(),
  max_months: z.number().optional(),
  fixed_items: z.array(z.string()).optional(),
  fixed_item_hints: z.array(z.string()).optional(),
  default_items: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
  required_options: z.array(z.string()).optional(),
  recommended_options: z.array(z.string()).optional(),
  /** For type 'choice': guided options with plain-language explanations (e.g. occupancy counting). */
  choices: z.array(ChoiceExplained).optional(),
  /** Which question this parameter depends on, for dependent guided choices. */
  depends_on: z.string().optional(),
})
export type Parameter = z.infer<typeof Parameter>

// ---------- Items and modules ----------

export const Source = z.object({
  ref: z.string(), // e.g. "NRC S&S Emergency Shelter toolkit 2026 §GL-SB403/FL"
  citation: z.string().optional(),
  licence: z.string().optional(),
})

export const ItemBase = z.object({
  item_id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'snake_case, stable forever'),
  type: XlsType,
  list: z.string().optional(),
  label: LString,
  hint: LString.optional(),
  construct: z.string().optional(),
  dimension: z.string().optional(),
  respondent: RespondentType,
  mode: Mode,
  core: z.boolean().default(false),
  lock: LockLevel.default('locked'),
  visibility: Visibility.default('respondent'),
  relevant: Relevance.optional(),
  relevant_note: z.string().optional(),
  required: z.boolean().optional(),
  /** Which option values count toward the numerator for this item's dimension. */
  flag_values: z.array(z.string()).optional(),
  threshold_param: z.string().optional(),
  source: Source.optional(),
  /** Official translations already approved (never regenerated). */
  approved_languages: z.array(LangCode).optional(),
})

export type Item = z.output<typeof ItemBase> & { sub_items?: Item[]; repeat_over_param?: string }
export type ItemInput = z.input<typeof ItemBase> & { sub_items?: ItemInput[]; repeat_over_param?: string }
export const Item: z.ZodType<Item, ItemInput> = ItemBase.extend({
  /** For repeat_group: the CO parameter whose list drives one block per entry. */
  repeat_over_param: z.string().optional(),
  sub_items: z.lazy(() => z.array(Item)).optional(),
})

export const ModuleKind = z.enum(['consent', 'identification', 'disaggregation', 'indicator', 'satisfaction', 'feedback', 'custom'])

export const Module = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_:\-./]*$/),
  kind: ModuleKind,
  title: LString,
  intro: LString.optional(),
  respondent: RespondentType,
  mode: Mode,
  items: z.array(Item),
  /** Estimated minutes per item for burden control; default used when absent. */
  minutes_per_item: z.number().optional(),
})
export type Module = z.infer<typeof Module>

// ---------- Qualitative guides ----------

export const GuideQuestion = z.object({ id: z.string(), label: LString, probes: z.array(LString).optional() })
export const Guide = z.object({
  respondent: RespondentType,
  mode: z.enum(['kii', 'fgd']),
  purpose: z.string().optional(),
  questions: z.array(GuideQuestion),
})

// ---------- Indicator ----------

export const IndicatorStatus = z.enum(['mandatory', 'suggested'])
export const Modality = z.enum(['any', 'in-kind', 'CVA'])
export const SupportStatus = z.enum(['supported', 'not_yet_supported', 'proposal_pending'])
export const ContentStatus = z.enum(['approved', 'proposal_derived', 'draft'])

export const LockedProfile = z.object({
  purpose: z.string(),
  definition: z.string(),
  calculation: z.object({ numerator: z.string(), denominator: z.string(), counting_rule: z.string() }),
  min_disaggregation: z.string(),
  data_source: z.string().optional(),
  methodology: z.string().optional(),
  frequency: z.string().optional(),
  triangulation: z.string().optional(),
  analysis: z.string().optional(),
  limitations: z.string().optional(),
  reporting_ref: z.string().optional(),
})

export const Bundle = z.object({
  indicator_id: z.string(),
  relation: z.enum(['pairs_with', 'requires', 'conditional_on', 'alternative_modality']),
  note: z.string().optional(),
})

export const Indicator = z.object({
  id: z.string(), // e.g. GL-SB403/FL
  gors_uid: z.string().optional(),
  toc: z.string(), // toc id within the package
  result: z.string(), // result id within the package
  level: z.enum(['Outcome', 'Output', 'Impact']).default('Outcome'),
  status: IndicatorStatus,
  modality: Modality.default('any'),
  title_template: z.string(),
  support: SupportStatus,
  content_status: ContentStatus.default('approved'),
  measurement_kind: z.enum(['questionnaire', 'measurement', 'count', 'scale', 'pre_post']).default('questionnaire'),
  locked: LockedProfile.optional(),
  parameters: z.array(Parameter).default([]),
  timing: TimingRule.optional(),
  /** Respondent types this indicator draws on, derived from its modules; kept for the board. */
  respondents: z.array(RespondentType).default([]),
  modules: z.array(z.string()).default([]), // module ids in this package
  guides: z.array(Guide).default([]),
  bundles: z.array(Bundle).default([]),
  /** Activity ids (from the package's activity catalogue) for which this indicator applies. */
  applicability: z.array(z.string()).default([]),
  numerator_rule_text: z.string().optional(),
  sources: z.array(Source).default([]),
  toolkit_link: z.string().optional(),
})
export type Indicator = z.infer<typeof Indicator>

// ---------- Activity catalogue ----------

export const Activity = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  toc: z.string(),
  area_of_work: z.string().optional(),
  modalities: z.array(Modality).default(['any']),
  /** The anchors this activity can supply (e.g. a distribution supplies 'distribution'). */
  anchors: z.array(Anchor).default(['activity_end']),
  respondents: z.array(RespondentType).default([]),
  unit: z.enum(['household', 'individual', 'facility', 'site', 'session']).default('household'),
  results: z.array(z.string()).default([]), // result ids this activity can lead to
  asks: z.array(z.enum(['modality', 'rounds', 'timing', 'population', 'location', 'units'])).default(['timing', 'population', 'location']),
})
export type Activity = z.infer<typeof Activity>

// ---------- Package and release ----------

export const Toc = z.object({ id: z.string(), name: z.string(), version: z.string(), source_toolkit: z.string().optional(), note: z.string().optional() })
export const Result = z.object({ id: z.string(), toc: z.string(), name: z.string(), level: z.enum(['Outcome', 'Output', 'Impact']).default('Outcome') })

export const CompetencyId = z.enum(['ss', 'wash', 'icla', 'edu', 'pfv', 'mpc'])
export type CompetencyId = z.infer<typeof CompetencyId>

export const BankPackage = z.object({
  schema_version: z.literal(2),
  package_id: z.string(),
  competency: z.object({ id: CompetencyId, name: z.string() }),
  version: z.string(),
  generated_from: z.string().optional(),
  global_rules: z.record(z.string(), z.string()).default({}),
  tocs: z.array(Toc),
  results: z.array(Result),
  indicators: z.array(Indicator),
  modules: z.array(Module),
  choice_lists: z.array(ChoiceList),
  activities: z.array(Activity).default([]),
  glossary: z.array(z.object({ term: z.string(), translations: LString.partial().optional(), note: z.string().optional() })).default([]),
})
export type BankPackage = z.infer<typeof BankPackage>

export const BankRelease = z.object({
  version: z.string(),
  date: z.string(),
  packages: z.array(z.object({ file: z.string(), competency: CompetencyId, package_version: z.string() })),
  shared_modules_file: z.string().optional(),
  changelog: z.array(z.string()).default([]),
})
export type BankRelease = z.infer<typeof BankRelease>

// ---------- Proposals (indicators without a toolkit) ----------

export const Proposal = z.object({
  id: z.string(),
  indicator_id: z.string(),
  requested_by: z.string().optional(),
  requested_on: z.string(),
  sources_allowed: z.array(z.string()),
  status: z.enum(['requested', 'drafted', 'in_review', 'approved', 'rejected']),
  draft_modules: z.array(Module).default([]),
  decisions: z.array(z.object({ by: z.string(), on: z.string(), decision: z.string(), note: z.string().optional() })).default([]),
})
export type Proposal = z.infer<typeof Proposal>

// ---------- Cross-reference validation ----------

export interface BankIssue {
  level: 'error' | 'warning'
  where: string
  message: string
}

/** Validates shape with zod, then cross-references (modules, lists, results, activities, item ids). */
export function validateBankPackage(input: unknown): { ok: boolean; pkg?: BankPackage; issues: BankIssue[] } {
  const parsed = BankPackage.safeParse(input)
  const issues: BankIssue[] = []
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ level: 'error', where: e.path.join('.'), message: e.message })
    return { ok: false, issues }
  }
  const pkg = parsed.data
  const tocIds = new Set(pkg.tocs.map((t) => t.id))
  const resultIds = new Set(pkg.results.map((r) => r.id))
  const moduleIds = new Set(pkg.modules.map((m) => m.id))
  const listIds = new Set(pkg.choice_lists.map((c) => c.id))
  const activityIds = new Set(pkg.activities.map((a) => a.id))
  const indicatorIds = new Set(pkg.indicators.map((i) => i.id))
  const itemIds = new Map<string, string>()

  for (const r of pkg.results) if (!tocIds.has(r.toc)) issues.push({ level: 'error', where: `results.${r.id}`, message: `unknown toc ${r.toc}` })

  const walk = (items: Item[], where: string) => {
    for (const it of items) {
      const prev = itemIds.get(it.item_id)
      if (prev) issues.push({ level: 'error', where, message: `duplicate item_id ${it.item_id} (also in ${prev})` })
      else itemIds.set(it.item_id, where)
      if ((it.type === 'select_one' || it.type === 'select_multiple') && !it.list)
        issues.push({ level: 'error', where: `${where}.${it.item_id}`, message: 'select item without list' })
      if (it.list && !it.list.startsWith('{') && !listIds.has(it.list))
        issues.push({ level: 'error', where: `${where}.${it.item_id}`, message: `unknown choice list ${it.list}` })
      if (it.type === 'repeat_group' && !it.repeat_over_param)
        issues.push({ level: 'error', where: `${where}.${it.item_id}`, message: 'repeat_group needs repeat_over_param' })
      if (it.sub_items) walk(it.sub_items, `${where}.${it.item_id}`)
    }
  }
  for (const m of pkg.modules) walk(m.items, `modules.${m.id}`)

  for (const ind of pkg.indicators) {
    const w = `indicators.${ind.id}`
    if (!tocIds.has(ind.toc)) issues.push({ level: 'error', where: w, message: `unknown toc ${ind.toc}` })
    if (!resultIds.has(ind.result)) issues.push({ level: 'error', where: w, message: `unknown result ${ind.result}` })
    for (const m of ind.modules) if (!moduleIds.has(m)) issues.push({ level: 'error', where: w, message: `unknown module ${m}` })
    for (const a of ind.applicability) if (!activityIds.has(a)) issues.push({ level: 'warning', where: w, message: `unknown activity ${a}` })
    for (const b of ind.bundles) if (!indicatorIds.has(b.indicator_id)) issues.push({ level: 'warning', where: w, message: `bundle references unknown indicator ${b.indicator_id}` })
    if (ind.support === 'supported') {
      if (ind.modules.length === 0) issues.push({ level: 'error', where: w, message: 'supported indicator has no modules' })
      if (!ind.timing) issues.push({ level: 'warning', where: w, message: 'supported indicator has no timing rule; planner will ask the user' })
      if (!ind.locked) issues.push({ level: 'error', where: w, message: 'supported indicator has no locked profile' })
    }
    const paramKeys = new Set(ind.parameters.map((p) => p.key))
    if (ind.timing?.parameter_key && !paramKeys.has(ind.timing.parameter_key))
      issues.push({ level: 'error', where: w, message: `timing.parameter_key ${ind.timing.parameter_key} is not a parameter` })
  }
  for (const a of pkg.activities) {
    for (const r of a.results) if (!resultIds.has(r)) issues.push({ level: 'error', where: `activities.${a.id}`, message: `unknown result ${r}` })
  }
  return { ok: !issues.some((i) => i.level === 'error'), pkg, issues }
}
