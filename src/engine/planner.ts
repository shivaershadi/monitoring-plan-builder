/**
 * Visit planner: turns selected indicators + described activities into proposed data-collection events.
 * Rule-based only (concept §6). No AI.
 */
import type { BankPackage, Duration, Indicator, Item, Mode, Module, RespondentType, TimingRule } from '@bank/schema/bank'
import { addDuration, daysBetween, overlap } from './dates'
import { cochran } from './sampling'

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

export interface PlanInput {
  pkg: BankPackage
  selectedIndicatorIds: string[]
  activities: PlannedActivity[]
  /** CO parameter values per indicator (only those that affect timing matter here). */
  parameters?: Record<string, Record<string, unknown>>
  sampling?: { confidence: 90 | 95 | 99; margin: number }
  /** Minutes per item when a module does not specify. */
  minutesPerItem?: Partial<Record<Mode, number>>
}

export interface PlannedEvent {
  id: string
  label: string
  respondent: RespondentType
  mode: Mode
  window: { start: string; end: string } | null
  indicator_ids: string[]
  module_ids: string[]
  item_count: number
  estimated_minutes: number
  sampling: { frame: number | null; n: number | null; census: boolean }
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
  indicator_id?: string
  event_id?: string
  message: string
}

export interface PlanResult {
  events: PlannedEvent[]
  warnings: PlanWarning[]
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
): { window: { start: string; end: string } | null; reason?: PlanWarning['code'] } {
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

export function planEvents(input: PlanInput): PlanResult {
  const { pkg, activities } = input
  const warnings: PlanWarning[] = []
  const events: PlannedEvent[] = []
  const modulesById = new Map(pkg.modules.map((m) => [m.id, m]))
  const indicators = pkg.indicators.filter((i) => input.selectedIndicatorIds.includes(i.id))
  const sampling = input.sampling ?? { confidence: 95 as const, margin: 5 }
  const minutes = { ...DEFAULT_MINUTES, ...(input.minutesPerItem ?? {}) }

  const served = new Set<string>()

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
    // Shared modules (consent, identification, disaggregation) attach to every event of the same respondent+mode.
    const shared = pkg.modules.filter((m) => m.kind !== 'indicator' && m.kind !== 'custom')

    for (const mod of mods) {
      let ev = events.find((e) => e.respondent === mod.respondent && e.mode === mod.mode && (!window || !e.window || overlap(e.window, window)))
      if (!ev) {
        ev = {
          id: `ev_${events.length + 1}`,
          label: `${labelRespondent(mod.respondent)} ${labelMode(mod.mode)}`,
          respondent: mod.respondent,
          mode: mod.mode,
          window,
          indicator_ids: [],
          module_ids: [],
          item_count: 0,
          estimated_minutes: 0,
          sampling: { frame: null, n: null, census: false },
          status: 'ready',
          notes: [],
        }
        events.push(ev)
        for (const s of shared) if (s.respondent === mod.respondent && s.mode === mod.mode && !ev.module_ids.includes(s.id)) ev.module_ids.push(s.id)
      } else if (window && ev.window) {
        ev.window = overlap(ev.window, window)
      } else if (window && !ev.window) {
        ev.window = window
      }
      if (!ev.indicator_ids.includes(ind.id)) ev.indicator_ids.push(ind.id)
      if (!ev.module_ids.includes(mod.id)) ev.module_ids.push(mod.id)
      served.add(ind.id)
    }
    if (mods.length === 0) warnings.push({ level: 'error', code: 'indicator_unserved', indicator_id: ind.id, message: `${ind.id} has no modules in the bank.` })
  }

  // Finish each event: counts, burden, sampling, status.
  for (const ev of events) {
    const mods = ev.module_ids.map((id) => modulesById.get(id)!).filter(Boolean)
    const seen = new Set<string>()
    let items = 0
    let mins = 0
    for (const m of mods) {
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

    const inds = ev.indicator_ids.map((id) => pkg.indicators.find((i) => i.id === id)!)
    const servingAll = inds.flatMap((i) => servingActivities(i, pkg, activities))
    const frames = servingAll.map((a) => (ev.respondent === 'facility' || ev.respondent === 'site' ? (a.units ?? 0) : (a.populations[ev.respondent] ?? 0))).filter((n) => n > 0)
    const frame = frames.length ? Math.max(...frames) : null
    if (frame) {
      const census = ev.respondent === 'facility' || ev.respondent === 'site' || cochran({ population: frame, ...sampling }) >= frame * 0.9
      ev.sampling = { frame, n: census ? frame : cochran({ population: frame, ...sampling }), census }
    } else {
      warnings.push({ level: 'warning', code: 'no_population', event_id: ev.id, message: `${ev.label}: no population figure for ${labelRespondent(ev.respondent)}; sample size cannot be computed.` })
      ev.status = 'needs_attention'
    }
    if (!ev.window) ev.status = 'needs_attention'
    if (ev.respondent === 'child') {
      ev.notes.push('Respondents are children: guardian consent and child assent branch required.')
      warnings.push({ level: 'warning', code: 'child_respondent', event_id: ev.id, message: `${ev.label}: respondents are children; guardian consent and assent apply.` })
    }
    const limit = LONG_INTERVIEW[ev.respondent] ?? LONG_INTERVIEW.default
    if (ev.estimated_minutes > limit) {
      ev.notes.push(`Estimated ${ev.estimated_minutes} min exceeds the ${limit} min guideline for this respondent type.`)
      warnings.push({ level: 'warning', code: 'long_interview', event_id: ev.id, message: `${ev.label}: about ${ev.estimated_minutes} minutes; consider splitting.` })
    }
    if (ev.window && daysBetween(ev.window.start, ev.window.end) < 0) ev.status = 'needs_attention'
    ev.label = `${labelRespondent(ev.respondent)} ${labelMode(ev.mode)}`
  }

  for (const ind of indicators) {
    if (ind.support === 'supported' && !served.has(ind.id) && !warnings.some((w) => w.indicator_id === ind.id && w.code === 'indicator_unserved'))
      warnings.push({ level: 'error', code: 'indicator_unserved', indicator_id: ind.id, message: `${ind.id} is served by no event.` })
  }

  // Stable ordering: by window start, unresolved last.
  events.sort((a, b) => (a.window?.start ?? '9999').localeCompare(b.window?.start ?? '9999'))
  events.forEach((e, i) => (e.id = `ev_${i + 1}`))
  return { events, warnings }
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
