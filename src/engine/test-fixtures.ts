/** Bank packages shared by tests: a synthetic one, and the real Emergency Shelter package as released. */
import { validateBankPackage, type BankPackage } from '@bank/schema/bank'
import esJson from '@bank/packages/ss-emergency-shelter.json'

export const es: BankPackage = validateBankPackage(esJson).pkg!

/** Minimal synthetic package: two indicators share the household respondent, one needs a facility observation. */
export const pkg: BankPackage = {
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
    { id: 'shelter', label: 'Shelter provision', toc: 'es', modalities: ['any'], anchors: ['handover'], respondents: ['household'], unit: 'household', results: ['r1'], asks: ['timing'], synonyms: [] },
    { id: 'nfi', label: 'NFI distribution', toc: 'es', modalities: ['in-kind'], anchors: ['distribution'], respondents: ['household'], unit: 'household', results: ['r2'], asks: ['timing'], synonyms: [] },
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
