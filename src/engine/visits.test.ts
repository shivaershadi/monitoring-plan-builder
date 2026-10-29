import { describe, expect, it } from 'vitest'
import { applyVisitEdits, type DraftEvent } from './visits'
import { planEvents, type PlannedActivity } from './planner'
import { pkg } from './test-fixtures'

const ev = (key: string, ids: string[], window: { start: string; end: string } | null, respondent = 'household'): DraftEvent => ({
  key,
  origin: 'proposed',
  respondent,
  mode: 'interview',
  window,
  indicator_windows: Object.fromEntries(ids.map((id) => [id, window])),
  indicator_ids: ids,
  indicator_modules: Object.fromEntries(ids.map((id) => [id, [`ind:${id.toLowerCase()}`]])),
  shared_module_ids: ['consent'],
})

const oct = { start: '2026-10-20', end: '2026-11-20' }
const dec = { start: '2026-12-10', end: '2027-01-10' }

describe('applyVisitEdits: merge', () => {
  it('merges two visits into one keyed by both parts, taking the later window when they do not overlap', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct), ev('b', ['B'], dec)], [{ op: 'merge', keys: ['a', 'b'] }])
    expect(r.events).toHaveLength(1)
    expect(r.events[0]).toMatchObject({ key: 'a+b', origin: 'merged', indicator_ids: ['A', 'B'], window: dec })
    expect(r.events[0].indicator_windows).toEqual({ A: oct, B: dec })
    expect(r.not_applied).toHaveLength(0)
  })
  it('uses the overlap when the windows overlap', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct), ev('b', ['B'], { start: '2026-11-01', end: '2026-12-01' })], [{ op: 'merge', keys: ['a', 'b'] }])
    expect(r.events[0].window).toEqual({ start: '2026-11-01', end: '2026-11-20' })
  })
  it('refuses to merge different respondents and reports the edit as not applied', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct), ev('f', ['F'], oct, 'facility')], [{ op: 'merge', keys: ['a', 'f'] }])
    expect(r.events).toHaveLength(2)
    expect(r.not_applied[0].reason).toMatch(/same respondent/)
  })
})

describe('applyVisitEdits: split', () => {
  it('moves the chosen indicators into a second visit with their own window', () => {
    const base = ev('a', ['A', 'B'], { start: '2026-11-01', end: '2026-11-20' })
    base.indicator_windows = { A: oct, B: { start: '2026-11-01', end: '2026-12-01' } }
    const r = applyVisitEdits([base], [{ op: 'split', key: 'a', indicator_ids: ['B'] }])
    expect(r.events.map((e) => e.key)).toEqual(['a#1', 'a#2'])
    expect(r.events[0]).toMatchObject({ indicator_ids: ['A'], window: oct, origin: 'split' })
    expect(r.events[1]).toMatchObject({ indicator_ids: ['B'], window: { start: '2026-11-01', end: '2026-12-01' } })
    expect(r.events[1].indicator_modules).toEqual({ B: ['ind:b'] })
    expect(r.events[1].shared_module_ids).toEqual(['consent'])
  })
  it('undoes a merge: merge then split gives back two visits', () => {
    const r = applyVisitEdits(
      [ev('a', ['A'], oct), ev('b', ['B'], dec)],
      [
        { op: 'merge', keys: ['a', 'b'] },
        { op: 'split', key: 'a+b', indicator_ids: ['B'] },
      ],
    )
    expect(r.events.map((e) => [e.key, e.indicator_ids, e.window])).toEqual([
      ['a+b#1', ['A'], oct],
      ['a+b#2', ['B'], dec],
    ])
  })
  it('refuses a split that would leave a side empty', () => {
    const r = applyVisitEdits([ev('a', ['A', 'B'], oct)], [{ op: 'split', key: 'a', indicator_ids: ['A', 'B'] }])
    expect(r.events).toHaveLength(1)
    expect(r.not_applied).toHaveLength(1)
  })
})

describe('applyVisitEdits: drop and move', () => {
  it('drops a visit and keeps it in the dropped list', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct), ev('b', ['B'], dec)], [{ op: 'drop', key: 'b' }])
    expect(r.events.map((e) => e.key)).toEqual(['a'])
    expect(r.dropped.map((e) => e.key)).toEqual(['b'])
  })
  it('moves a visit to new dates and keeps its key for later edits', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct)], [{ op: 'move', key: 'a', window: dec }, { op: 'drop', key: 'a' }])
    expect(r.events).toHaveLength(0)
    expect(r.dropped[0]).toMatchObject({ key: 'a', origin: 'moved', window: dec })
  })
  it('reports edits on visits that no longer exist instead of guessing', () => {
    const r = applyVisitEdits([ev('a', ['A'], oct)], [{ op: 'drop', key: 'gone' }])
    expect(r.events).toHaveLength(1)
    expect(r.not_applied[0]).toMatchObject({ index: 0, reason: expect.stringMatching(/no longer exists/) })
  })
})

describe('planEvents with edits', () => {
  const activities: PlannedActivity[] = [
    { id: '1', activity_id: 'shelter', label: 'Shelter', timing: { start: '2026-10-30', end: '2026-10-30' }, populations: { household: 500 }, units: 500 },
    { id: '2', activity_id: 'nfi', label: 'NFI', timing: { start: '2026-08-01', end: '2026-08-20' }, populations: { household: 800 } },
  ]
  const input = { pkg, selectedIndicatorIds: ['A', 'B'], activities }

  it('proposes separate household visits when windows do not overlap, each with a stable key', () => {
    const r = planEvents(input)
    const hh = r.events.filter((e) => e.respondent === 'household')
    expect(hh.map((e) => e.key).sort()).toEqual(['household.interview@A', 'household.interview@B'])
  })
  it('a merge yields one visit, flags the indicator now outside its window, and recomputes the sample', () => {
    const r = planEvents(input, [{ op: 'merge', keys: ['household.interview@A', 'household.interview@B'] }])
    const hh = r.events.filter((e) => e.respondent === 'household')
    expect(hh).toHaveLength(1)
    expect(hh[0].indicator_ids).toEqual(['A', 'B'])
    expect(hh[0].sampling.frame).toBe(800)
    expect(r.warnings.find((w) => w.code === 'outside_window')?.indicator_id).toBe('B')
  })
  it('dropping a visit reports the indicator that loses coverage', () => {
    const r = planEvents(input, [{ op: 'drop', key: 'household.interview@B' }])
    expect(r.warnings).toContainEqual(expect.objectContaining({ level: 'error', code: 'indicator_unserved', indicator_id: 'B', message: expect.stringMatching(/dropped/) }))
  })
  it('applies per-visit sampling settings, including strata', () => {
    const r = planEvents(input, [], { 'household.interview@A': { confidence: 90, margin: 10, strata: [{ name: 'Camp', population: 300 }, { name: 'Host', population: 200 }] } })
    const a = r.events.find((e) => e.key === 'household.interview@A')!
    expect(a.sampling).toMatchObject({ frame: 500, confidence: 90, margin: 10 })
    expect(a.sampling.strata?.map((s) => s.n)).toEqual([56, 51])
    expect(a.sampling.n).toBe(107)
  })
})
