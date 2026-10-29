/**
 * User edits to the proposed visits, replayed in order on every re-plan (pure, no AI).
 *
 * Events are addressed by key, not by position: a proposed event's key is
 * "<respondent>.<mode>@<first indicator in bank order>", a merged event's key joins its parts with "+",
 * and split parts append "#1" (kept) and "#2" (new). An edit whose event no longer exists (because the
 * canvas or the indicator selection changed the grouping) is reported as not applied, never guessed.
 */
import type { Mode, RespondentType } from '@bank/schema/bank'
import { overlap } from './dates'

export interface VisitWindow {
  start: string
  end: string
}

export interface DraftEvent {
  key: string
  origin: 'proposed' | 'merged' | 'split' | 'moved'
  respondent: RespondentType
  mode: Mode
  window: VisitWindow | null
  /** The window each indicator's timing rule asks for, kept so a moved or merged visit can be checked against it. */
  indicator_windows: Record<string, VisitWindow | null>
  indicator_ids: string[]
  /** Indicator modules per indicator, so a split moves the right modules. */
  indicator_modules: Record<string, string[]>
  /** Consent, identification and disaggregation modules for this respondent and mode. */
  shared_module_ids: string[]
}

export type VisitEdit =
  | { op: 'merge'; keys: [string, string] }
  | { op: 'split'; key: string; indicator_ids: string[] }
  | { op: 'drop'; key: string; note?: string }
  | { op: 'move'; key: string; window: VisitWindow }

export interface EditResult {
  events: DraftEvent[]
  dropped: DraftEvent[]
  not_applied: Array<{ index: number; edit: VisitEdit; reason: string }>
}

/** Window shared by all the given indicator windows; null when they do not overlap or none is known. */
function commonWindow(windows: Array<VisitWindow | null>): VisitWindow | null {
  const known = windows.filter((w): w is VisitWindow => !!w)
  if (!known.length) return null
  return known.slice(1).reduce<VisitWindow | null>((acc, w) => (acc ? overlap(acc, w) : null), known[0])
}

/**
 * One visit for both. Overlapping windows give their overlap. Disjoint windows (the usual case, since the
 * planner already joins overlapping ones) give the later window: one visit cannot sit inside both, and
 * finishEvents then warns for the indicator measured outside its own window, so the user can move the visit.
 */
export function mergeEvents(a: DraftEvent, b: DraftEvent): DraftEvent {
  const window = a.window && b.window ? (overlap(a.window, b.window) ?? (a.window.start >= b.window.start ? a.window : b.window)) : (a.window ?? b.window)
  return {
    key: `${a.key}+${b.key}`,
    origin: 'merged',
    respondent: a.respondent,
    mode: a.mode,
    window,
    indicator_windows: { ...a.indicator_windows, ...b.indicator_windows },
    indicator_ids: [...a.indicator_ids, ...b.indicator_ids.filter((id) => !a.indicator_ids.includes(id))],
    indicator_modules: { ...a.indicator_modules, ...b.indicator_modules },
    shared_module_ids: [...a.shared_module_ids, ...b.shared_module_ids.filter((id) => !a.shared_module_ids.includes(id))],
  }
}

export function splitEvent(ev: DraftEvent, moveIds: string[]): [DraftEvent, DraftEvent] {
  const keep = ev.indicator_ids.filter((id) => !moveIds.includes(id))
  const move = ev.indicator_ids.filter((id) => moveIds.includes(id))
  const part = (ids: string[], suffix: string): DraftEvent => ({
    ...ev,
    key: `${ev.key}#${suffix}`,
    origin: 'split',
    // A moved visit keeps the date the user chose; otherwise each part gets the window its own indicators share.
    window: ev.origin === 'moved' ? ev.window : (commonWindow(ids.map((id) => ev.indicator_windows[id] ?? null)) ?? ev.window),
    indicator_ids: ids,
    indicator_windows: Object.fromEntries(ids.map((id) => [id, ev.indicator_windows[id] ?? null])),
    indicator_modules: Object.fromEntries(ids.map((id) => [id, ev.indicator_modules[id] ?? []])),
  })
  return [part(keep, '1'), part(move, '2')]
}

export function applyVisitEdits(proposed: DraftEvent[], edits: VisitEdit[]): EditResult {
  let events = proposed.map((e) => ({ ...e }))
  const dropped: DraftEvent[] = []
  const not_applied: EditResult['not_applied'] = []
  const find = (key: string) => events.findIndex((e) => e.key === key)

  edits.forEach((edit, index) => {
    const skip = (reason: string) => not_applied.push({ index, edit, reason })
    if (edit.op === 'merge') {
      const [ia, ib] = edit.keys.map(find)
      if (ia < 0 || ib < 0) return skip('a visit to merge no longer exists')
      if (ia === ib) return skip('a visit cannot be merged with itself')
      const a = events[ia]
      const b = events[ib]
      if (a.respondent !== b.respondent || a.mode !== b.mode) return skip('only visits with the same respondent and method can be merged')
      const merged = mergeEvents(a, b)
      events = events.flatMap((e, i) => (i === ia ? [merged] : i === ib ? [] : [e]))
    } else if (edit.op === 'split') {
      const i = find(edit.key)
      if (i < 0) return skip('the visit to split no longer exists')
      const ev = events[i]
      const moving = edit.indicator_ids.filter((id) => ev.indicator_ids.includes(id))
      if (moving.length === 0 || moving.length === ev.indicator_ids.length) return skip('a split must leave at least one indicator on each side')
      events = events.flatMap((e, j) => (j === i ? splitEvent(ev, moving) : [e]))
    } else if (edit.op === 'drop') {
      const i = find(edit.key)
      if (i < 0) return skip('the visit to drop no longer exists')
      dropped.push(events[i])
      events = events.filter((_, j) => j !== i)
    } else if (edit.op === 'move') {
      const i = find(edit.key)
      if (i < 0) return skip('the visit to move no longer exists')
      if (edit.window.end < edit.window.start) return skip('the new window ends before it starts')
      events[i] = { ...events[i], window: { ...edit.window }, origin: 'moved' }
    }
  })
  return { events, dropped, not_applied }
}
