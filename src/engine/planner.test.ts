import { describe, expect, it } from 'vitest'
import type { BankPackage } from '@bank/schema/bank'
import { planEvents } from './planner'

/** Minimal synthetic package: two indicators share the household respondent, one needs a facility observation. */
const pkg: BankPackage = {
  schema_version: 2,
  package_id: 'test',
  competency: { id: 'ss', name: 'Shelter & Settlements' },
  version: '0',
  global_rules: {},
  tocs: [{ id: 'es', name: 'Emergency Shelter', version: '2026' }],
  results: [
    { id: 'r1', toc: 'es', name: 'Use of shelter', level: 'Outcome' },
    { id: 'r2', toc: 'es', name: 'Use of items', level: 'Outcome' },
  ],
  choice_lists: [{ id: 'yn', options: [{ name: 'yes', label: { en: 'Yes' } }, { name: 'no', label: { en: 'No' } }] }],
  activities: [
    { id: 'shelter', label: 'Shelter provision', toc: 'es', modalities: ['any'], anchors: ['handover'], respondents: ['household'], unit: 'household', results: ['r1'], asks: ['timing'] },
    { id: 'nfi', label: 'NFI distribution', toc: 'es', modalities: ['in-kind'], anchors: ['distribution'], respondents: ['household'], unit: 'household', results: ['r2'], asks: ['timing'] },
  ],
  glossary: [],
  modules: [
    { id: 'consent', kind: 'consent', title: { en: 'Consent' }, respondent: 'household', mode: 'interview', items: [{ item_id: 'consent', type: 'select_one', list: 'yn', label: { en: 'Agree?' }, respondent: 'household', mode: 'interview', core: true, lock: 'locked', visibility: 'respondent' }] },
    { id: 'ind:a', kind: 'indicator', title: { en: 'A' }, respondent: 'household', mode: 'interview', items: [
      { item_id: 'a_q1', type: 'select_one', list: 'yn', label: { en: 'Q1' }, respondent: 'household', mode: 'interview', core: true, lock: 'locked', visibility: 'respondent' },
      { item_id: 'a_q2', type: 'text', label: { en: 'Q2' }, respondent: 'household', mode: 'interview', core: false, lock: 'free', visibility: 'respondent' },
    ] },
    { id: 'ind:a_obs', kind: 'indicator', title: { en: 'A obs' }, respondent: 'facility', mode: 'observation', items: [
      { item_id: 'a_obs1', type: 'select_one', list: 'yn', label: { en: 'Present?' }, respondent: 'facility', mode: 'observation', core: true, lock: 'locked', visibility: 'respondent' },
    ] },
    { id: 'ind:b', kind: 'indicator', title: { en: 'B' }, respondent: 'household', mode: 'interview', items: [
      { item_id: 'b_q1', type: 'select_one', list: 'yn', label: { en: 'B1' }, respondent: 'household', mode: 'interview', core: true, lock: 'locked', visibility: 'respondent' },
    ] },
  ],
  indicators: [
    { id: 'A', toc: 'es', result: 'r1', level: 'Outcome', status: 'mandatory', modality: 'any', title_template: 'A', support: 'supported', content_status: 'approved', measurement_kind: 'questionnaire',
      locked: { purpose: '', definition: '', calculation: { numerator: '', denominator: '', counting_rule: '' }, min_disaggregation: '' },
      parameters: [{ key: 'occupancy_window', label: 'w', type: 'duration', required: true, guidance: '' }],
      timing: { anchor: 'handover', offset: { value: 1, unit: 'months' }, window: { value: 1, unit: 'months' }, parameter_key: 'occupancy_window', per_round: false },
      respondents: ['household', 'facility'], modules: ['ind:a', 'ind:a_obs'], guides: [], bundles: [], applicability: ['shelter'], sources: [] },
    { id: 'B', toc: 'es', result: 'r2', level: 'Outcome', status: 'mandatory', modality: 'in-kind', title_template: 'B', support: 'supported', content_status: 'approved', measurement_kind: 'questionnaire',
      locked: { purpose: '', definition: '', calculation: { numerator: '', denominator: '', counting_rule: '' }, min_disaggregation: '' },
      parameters: [], timing: { anchor: 'distribution', offset: { value: 1, unit: 'months' }, window: { value: 1, unit: 'months' }, per_round: false },
      respondents: ['household'], modules: ['ind:b'], guides: [], bundles: [], applicability: [], sources: [] },
    { id: 'C', toc: 'es', result: 'r2', level: 'Outcome', status: 'suggested', modality: 'any', title_template: 'C', support: 'not_yet_supported', content_status: 'draft', measurement_kind: 'questionnaire',
      parameters: [], respondents: [], modules: [], guides: [], bundles: [], applicability: [], sources: [] },
  ],
}

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
