import { describe, expect, it } from 'vitest'
import { pkg } from './test-fixtures'
import { planEvents } from './planner'

describe('planEvents', () => {
  it('merges two household interviews with overlapping windows and keeps the facility observation separate', () => {
    const r = planEvents({
      pkg,
      selectedIndicatorIds: ['A', 'B'],
      activities: [
        { id: '1', activity_id: 'shelter', label: 'Shelter', timing: { start: '2026-10-30', end: '2026-10-30' }, populations: { household: 500 }, units: 500 },
        { id: '2', activity_id: 'nfi', label: 'NFI', timing: { start: '2026-10-20', end: '2026-11-05' }, populations: { household: 500 } },
      ],
    })
    const hh = r.events.filter((e) => e.respondent === 'household')
    expect(hh).toHaveLength(1)
    expect(hh[0].indicator_ids.sort()).toEqual(['A', 'B'])
    expect(hh[0].module_ids).toContain('consent')
    expect(hh[0].window).toEqual({ start: '2026-12-05', end: '2026-12-30' }) // intersection of A (11-30..12-30) and B (12-05..01-05)
    expect(hh[0].sampling.n).toBe(218)
    const fac = r.events.find((e) => e.respondent === 'facility')!
    expect(fac.sampling.census).toBe(true)
    expect(r.warnings.filter((w) => w.level === 'error')).toHaveLength(0)
  })
  it('honours a CO parameter that overrides the offset', () => {
    const r = planEvents({
      pkg,
      selectedIndicatorIds: ['A'],
      activities: [{ id: '1', activity_id: 'shelter', label: 'Shelter', timing: { start: '2026-10-30', end: '2026-10-30' }, populations: { household: 100 } }],
      parameters: { A: { occupancy_window: '2 months' } },
    })
    expect(r.events[0].window?.start).toBe('2026-12-30')
  })
  it('flags unresolved timing, unsupported indicators and missing populations', () => {
    const r = planEvents({
      pkg,
      selectedIndicatorIds: ['A', 'C'],
      activities: [{ id: '1', activity_id: 'shelter', label: 'Shelter', timing: null, populations: {} }],
    })
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['timing_unresolved', 'indicator_unserved', 'no_population']))
    expect(r.events.every((e) => e.status === 'needs_attention')).toBe(true)
  })
  it('reports an indicator with no serving activity', () => {
    const r = planEvents({ pkg, selectedIndicatorIds: ['B'], activities: [] })
    expect(r.warnings.some((w) => w.code === 'no_activity' && w.indicator_id === 'B')).toBe(true)
  })
})
