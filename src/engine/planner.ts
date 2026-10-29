/**
 * Visit planner: turns selected indicators + described activities into proposed data-collection events.
 * Rule-based only (concept §6). No AI.
 *
 * Three pure steps:
 *  1. proposeEvents: group indicator modules by respondent, mode and overlapping window.
 *  2. applyVisitEdits (visits.ts): replay the user's merge / split / drop / move edits.
 *  3. finishEvents: item counts, length, sampling, status and warnings.
 * planEvents runs all three, so a re-plan after the canvas changes keeps the user's edits.
 */
import type { BankPackage, Duration, Indicator, Item, Mode, Module, RespondentType, TimingRule } from '@bank/schema/bank'
import { addDuration, daysBetween, overlap } from './dates'
import { cochran, stratified, type Stratum } from './sampling'
import { applyVisitEdits, type DraftEvent, type VisitEdit, type VisitWindow } from './visits'

export interface PlannedActivity {
  id: string
  activity_id: string
  label: string
  /** Resolved timing; null when the user has not resolved it yet. */
  timing: { start: string; end: string } | null
  /** Population per respondent type, e.g. { household: 500, teacher: 84 }. */
  populations: Record<string, number>
  /** Number of units (shelters, classrooms, water points) when the unit is a facility or site. */
  units?: number
  rounds?: number
}

export type Confidence = 90 | 95 | 99

export interface EventSettings {
  confidence?: Confidence
  margin?: number
  /** Stratified sampling: the same confidence and margin applied within each stratum. */
  strata?: Stratum[]
}

export interface PlanInput {
  pkg: BankPackage
  selectedIndicatorIds: string[]
  activities: PlannedActivity[]
  /** CO parameter values per indicator (only those that affect timing matter here). */
  parameters?: Record<string, Record<string, unknown>>
  sampling?: { confidence: Confidence; margin: number }
  /** Minutes per item when a module does not specify. */
  minutesPerItem?: Partial<Record<Mode, number>>
}

export interface PlannedEvent {
  /** Stable identity used by user edits: survives re-planning while the grouping stays the same. */
  key: string
  id: string
  label: string
  origin: DraftEvent['origin']
  respondent: RespondentType
  mode: Mode
  window: VisitWindow | null
  /** The window each served indicator's timing rule asks for. */
  indicator_windows: Record<string, VisitWindow | null>
  indicator_ids: string[]
  module_ids: string[]
  item_count: number
  estimated_minutes: number
  sampling: { frame: number | null; n: number | null; census: boolean; confidence: Confidence; margin: number; strata?: Array<Stratum & { n: number }> }
  status: 'ready' | 'needs_attention'
  notes: string[]
}

export interface PlanWarning {
  level: 'warning' | 'error'
  code:
    | 'indicator_unserved'
    | 'timing_unresolved'
    | 'no_timing_rule'
    | 'no_activity'
    | 'child_respondent'
    | 'no_population'
    | 'long_interview'
    | 'outside_window'
    | 'edit_not_applied'
  indicator_id?: string
  event_id?: string
  message: string
}

export interface PlanResult {
  events: PlannedEvent[]
  warnings: PlanWarning[]
  /** Events the user dropped, kept so the UI can show what they served. */
  dropped: DraftEvent[]
}

const DEFAULT_MINUTES: Record<Mode, number> = { interview: 0.6, observation: 1.0, kii: 2.5, fgd: 4, measurement: 3 }
const LONG_INTERVIEW: Record<string, number> = { child: 15, household: 30, individual: 30, teacher: 30, default: 40 }

function countItems(items: Item[]): number {
  let n = 0
  for (const it of items) {
    if (it.type === 'repeat_group') n += (it.sub_items?.length ?? 0) * 3 // assume ~3 list entries
    else if (it.type !== 'note' && it.type !== 'calculate') n += 1
  }
  return n
}

function resolveOffset(rule: TimingRule, params?: Record<string, unknown>): Duration {
  const v = rule.parameter_key ? params?.[rule.parameter_key] : undefined
  if (typeof v === 'string') {
    const m = v.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(day|week|month)s?$/)
    if (m) return { value: Number(m[1]), unit: (m[2] + 's') as Duration['unit'] }
  }
  if (typeof v === 'number' && v > 0) return { value: v, unit: 'months' }
  return rule.offset
}

/** Activities that can serve an indicator: explicit applicability first, else result match. */
export function servingActivities(ind: Indicator, pkg: BankPackage, activities: PlannedActivity[]): PlannedActivity[] {
  const byId = new Map(pkg.activities.map((a) => [a.id, a]))
  return activities.filter((pa) => {
    const def = byId.get(pa.activity_id)
    if (!def) return false
    if (ind.applicability.length) return ind.applicability.includes(pa.activity_id)
    return def.results.includes(ind.result)
  })
}

/** Measurement window of an indicator given its serving activities. */
export function indicatorWindow(
  ind: Indicator,
  serving: PlannedActivity[],
  params?: Record<string, unknown>,
): { window: VisitWindow | null; reason?: PlanWarning['code'] } {
  if (!ind.timing) return { window: null, reason: 'no_timing_rule' }
  const timed = serving.filter((a) => a.timing)
  if (serving.length === 0) return { window: null, reason: 'no_activity' }
  if (timed.length === 0) return { window: null, reason: 'timing_unresolved' }
  const offset = resolveOffset(ind.timing, params)
  // Anchor on the latest end date among serving activities (last distribution / handover).
  const anchor = timed.map((a) => a.timing!.end).sort().at(-1)!
  const start = addDuration(anchor, offset)
  const end = addDuration(start, ind.timing.window)
  return { window: { start, end } }
}

/** Step 1: one draft event per respondent, mode and overlapping window. */
export function proposeEvents(input: PlanInput): { events: DraftEvent[]; warnings: PlanWarning[] } {
  const { pkg, activities } = input
  const warnings: PlanWarning[] = []
  const events: DraftEvent[] = []
  const modulesById = new Map(pkg.modules.map((m) => [m.id, m]))
  // Bank order, so an event's key (its first indicator) does not depend on the order of selection.
  const indicators = pkg.indicators.filter((i) => input.selectedIndicatorIds.includes(i.id))
  // Shared modules (consent, identification, disaggregation) attach to every event of the same respondent+mode.
  const shared = pkg.modules.filter((m) => m.kind !== 'indicator' && m.kind !== 'custom')

  for (const ind of indicators) {
    if (ind.support !== 'supported') {
      warnings.push({ level: 'warning', code: 'indicator_unserved', indicator_id: ind.id, message: `${ind.id} is not yet supported by the bank; no event planned.` })
      continue
    }
    const serving = servingActivities(ind, pkg, activities)
    const { window, reason } = indicatorWindow(ind, serving, input.parameters?.[ind.id])
    if (!window && reason) {
      const msg =
        reason === 'no_activity'
          ? `${ind.id}: no activity on the canvas serves this indicator.`
          : reason === 'timing_unresolved'
            ? `${ind.id}: the serving activity has no resolved timing, so the window is unknown.`
            : `${ind.id}: no timing rule in the bank; set the window manually.`
      warnings.push({ level: 'warning', code: reason, indicator_id: ind.id, message: msg })
    }

    const mods = ind.modules.map((id) => modulesById.get(id)).filter((m): m is Module => !!m)
    for (const mod of mods) {
      let ev = events.find((e) => e.respondent === mod.respondent && e.mode === mod.mode && (!window || !e.window || overlap(e.window, window)))
      if (!ev) {
        ev = {
          key: `${mod.respondent}.${mod.mode}@${ind.id}`,
          origin: 'proposed',
          respondent: mod.respondent,
          mode: mod.mode,
          window,
          indicator_windows: {},
          indicator_ids: [],
          indicator_modules: {},
          shared_module_ids: shared.filter((s) => s.respondent === mod.respondent && s.mode === mod.mode).map((s) => s.id),
        }
        events.push(ev)
      } else if (window && ev.window) {
        ev.window = overlap(ev.window, window)
      } else if (window && !ev.window) {
        ev.window = window
      }
      if (!ev.indicator_ids.includes(ind.id)) ev.indicator_ids.push(ind.id)
      ev.indicator_windows[ind.id] = window
      ev.indicator_modules[ind.id] = [...(ev.indicator_modules[ind.id] ?? []), mod.id]
    }
    if (mods.length === 0) warnings.push({ level: 'error', code: 'indicator_unserved', indicator_id: ind.id, message: `${ind.id} has no modules in the bank.` })
  }
  return { events, warnings }
}

/** Step 3: counts, length, sampling, status and the warnings that depend on the final events. */
export function finishEvents(
  drafts: DraftEvent[],
  input: PlanInput,
  settings: Record<string, EventSettings> = {},
): { events: PlannedEvent[]; warnings: PlanWarning[] } {
  const { pkg, activities } = input
  const warnings: PlanWarning[] = []
  const modulesById = new Map(pkg.modules.map((m) => [m.id, m]))
  const minutes = { ...DEFAULT_MINUTES, ...(input.minutesPerItem ?? {}) }
  const base = input.sampling ?? { confidence: 95 as const, margin: 5 }

  const events: PlannedEvent[] = drafts.map((d) => {
    const module_ids = [...d.shared_module_ids, ...d.indicator_ids.flatMap((id) => d.indicator_modules[id] ?? [])].filter((id, i, a) => a.indexOf(id) === i)
    const ev: PlannedEvent = {
      key: d.key,
      id: '',
      label: `${labelRespondent(d.respondent)} ${labelMode(d.mode)}`,
      origin: d.origin,
      respondent: d.respondent,
      mode: d.mode,
      window: d.window,
      indicator_windows: d.indicator_windows,
      indicator_ids: d.indicator_ids,
      module_ids,
      item_count: 0,
      estimated_minutes: 0,
      sampling: { frame: null, n: null, census: false, confidence: base.confidence, margin: base.margin },
      status: 'ready',
      notes: [],
    }

    // Items are deduplicated by item_id, so a respondent is asked a shared question once.
    const seen = new Set<string>()
    let items = 0
    let mins = 0
    for (const m of module_ids.map((id) => modulesById.get(id)).filter((m): m is Module => !!m)) {
      for (const it of m.items) {
        if (seen.has(it.item_id)) continue
        seen.add(it.item_id)
        const c = countItems([it])
        items += c
        mins += c * (m.minutes_per_item ?? minutes[m.mode])
      }
    }
    ev.item_count = items
    ev.estimated_minutes = Math.round(mins)

    const s = settings[d.key] ?? {}
    const confidence = s.confidence ?? base.confidence
    const margin = s.margin ?? base.margin
    const unitBased = ev.respondent === 'facility' || ev.respondent === 'site'
    const inds = ev.indicator_ids.map((id) => pkg.indicators.find((i) => i.id === id)).filter((i): i is Indicator => !!i)
    const servingAll = inds.flatMap((i) => servingActivities(i, pkg, activities))
    const frames = servingAll.map((a) => (unitBased ? (a.units ?? 0) : (a.populations[ev.respondent] ?? 0))).filter((n) => n > 0)
    if (s.strata && s.strata.length > 0 && !unitBased) {
      const st = stratified(s.strata, confidence, margin)
      const frame = s.strata.reduce((a, x) => a + x.population, 0)
      ev.sampling = { frame, n: st.total, census: st.total >= frame, confidence, margin, strata: st.perStratum }
    } else if (frames.length) {
      const frame = Math.max(...frames)
      const n = cochran({ population: frame, confidence, margin })
      const census = unitBased || n >= frame * 0.9
      ev.sampling = { frame, n: census ? frame : n, census, confidence, margin }
    } else {
      ev.sampling = { frame: null, n: null, census: false, confidence, margin }
      warnings.push({ level: 'warning', code: 'no_population', event_id: ev.key, message: `${ev.label}: no population figure for ${labelRespondent(ev.respondent)}; sample size cannot be computed.` })
      ev.status = 'needs_attention'
    }

    if (!ev.window) ev.status = 'needs_attention'
    if (ev.window && daysBetween(ev.window.start, ev.window.end) < 0) ev.status = 'needs_attention'
    if (ev.window) {
      for (const id of ev.indicator_ids) {
        const w = ev.indicator_windows[id]
        if (w && !overlap(w, ev.window)) {
          ev.notes.push(`${id} asks for ${w.start} to ${w.end}; this visit falls outside it.`)
          warnings.push({ level: 'warning', code: 'outside_window', event_id: ev.key, indicator_id: id, message: `${ev.label} (${ev.window.start} to ${ev.window.end}) is outside the measurement window of ${id} (${w.start} to ${w.end}).` })
        }
      }
    }
    if (ev.respondent === 'child') {
      ev.notes.push('Respondents are children: guardian consent and child assent branch required.')
      warnings.push({ level: 'warning', code: 'child_respondent', event_id: ev.key, message: `${ev.label}: respondents are children; guardian consent and assent apply.` })
    }
    const limit = LONG_INTERVIEW[ev.respondent] ?? LONG_INTERVIEW.default
    if (ev.estimated_minutes > limit) {
      ev.notes.push(`Estimated ${ev.estimated_minutes} min exceeds the ${limit} min guideline for this respondent type.`)
      warnings.push({ level: 'warning', code: 'long_interview', event_id: ev.key, message: `${ev.label}: about ${ev.estimated_minutes} minutes; consider splitting.` })
    }
    return ev
  })

  // Stable ordering: by window start, unresolved last; ids follow the order.
  events.sort((a, b) => (a.window?.start ?? '9999').localeCompare(b.window?.start ?? '9999') || a.key.localeCompare(b.key))
  events.forEach((e, i) => (e.id = `ev_${i + 1}`))
  return { events, warnings }
}

/** Proposes events, replays the user's edits, and finishes them. */
export function planEvents(input: PlanInput, edits: VisitEdit[] = [], settings: Record<string, EventSettings> = {}): PlanResult {
  const proposed = proposeEvents(input)
  const edited = applyVisitEdits(proposed.events, edits)
  const finished = finishEvents(edited.events, input, settings)
  const warnings = [...proposed.warnings, ...finished.warnings]

  for (const o of edited.not_applied) warnings.push({ level: 'warning', code: 'edit_not_applied', message: `An earlier change no longer applies (${o.reason}). Review the visits.` })

  const served = new Set(finished.events.flatMap((e) => e.indicator_ids))
  for (const ind of input.pkg.indicators.filter((i) => input.selectedIndicatorIds.includes(i.id))) {
    if (ind.support !== 'supported' || served.has(ind.id)) continue
    if (warnings.some((w) => w.indicator_id === ind.id && w.code === 'indicator_unserved')) continue
    const droppedBy = edited.dropped.find((d) => d.indicator_ids.includes(ind.id))
    warnings.push({
      level: 'error',
      code: 'indicator_unserved',
      indicator_id: ind.id,
      message: droppedBy
        ? `${ind.id} is served by no visit since ${labelRespondent(droppedBy.respondent)} ${labelMode(droppedBy.mode)} was dropped.`
        : `${ind.id} is served by no event.`,
    })
  }
  return { events: finished.events, warnings, dropped: edited.dropped }
}

export function labelRespondent(r: RespondentType): string {
  const map: Record<string, string> = {
    household: 'Household',
    individual: 'Individual',
    child: 'Pupil / child',
    caregiver: 'Caregiver',
    teacher: 'Teacher',
    head_teacher: 'Head teacher',
    committee: 'Committee',
    community_rep: 'Community representative',
    service_provider: 'Service provider',
    facility: 'Facility',
    site: 'Site',
  }
  return map[r] ?? r
}
export function labelMode(m: Mode): string {
  return { interview: 'interview', observation: 'observation', kii: 'key-informant interview', fgd: 'focus group', measurement: 'measurement' }[m]
}
