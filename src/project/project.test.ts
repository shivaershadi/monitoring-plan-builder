import { describe, expect, it } from 'vitest'
import { newProject, readProject, PROJECT_SCHEMA_VERSION, type ProjectActivity } from './schema'
import { applyAction } from './reducer'
import { parseProjectFile, projectFileName, serializeProject } from './file'

const T0 = '2026-10-29T10:00:00.000Z'
const T1 = '2026-10-29T11:00:00.000Z'
const base = () => newProject({ id: 'p1', name: 'Maiduguri ES round 2', now: T0, bank_version: '2026.10.1', country: 'Nigeria' })
const act = (id: string, activity_id: string): ProjectActivity => ({
  id,
  activity_id,
  package_id: 'ss-emergency-shelter',
  raw_timing: '',
  timing: null,
  modalities: ['in-kind'],
  populations: {},
  location: '',
  notes: '',
})

describe('project schema', () => {
  it('creates a project with every later-phase field defaulted', () => {
    const p = base()
    expect(p.schema_version).toBe(PROJECT_SCHEMA_VERSION)
    expect(p.meta).toMatchObject({ languages: ['en'], mode: 'builder', entry: 'intervention', version: 0, created: T0, updated: T0 })
    expect(p.sampling).toEqual({ confidence: 95, margin: 5 })
    expect(p.context.consent).toEqual({ kind: 'verbal', under18: false })
    expect(p).toMatchObject({ activities: [], indicators: [], visit_edits: [], content_requests: [], strings: {}, edit_log: [] })
  })
  it('refuses files from a newer app and damaged files with a readable message', () => {
    expect(readProject({ schema_version: 99 })).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) })
    expect(readProject({ schema_version: 1, meta: { id: 'x' } })).toMatchObject({ ok: false, error: expect.stringMatching(/damaged/) })
    expect(readProject('nonsense')).toMatchObject({ ok: false })
  })
})

describe('project reducer', () => {
  it('stamps the update time and leaves the document untouched for a no-op', () => {
    const p = applyAction(base(), { type: 'add_activity', activity: act('a1', 'es_whole_shelter') }, T1)
    expect(p.meta.updated).toBe(T1)
    expect(p.activities).toHaveLength(1)
    const same = applyAction(p, { type: 'set_indicator', choice: { id: 'GL-SB403/FL', origin: 'mandatory', state: 'removed' } }, '2026-10-30T00:00:00.000Z')
    expect(same).toBe(p) // removing a mandatory indicator needs a note
  })
  it('keeps English first and unique in the language list', () => {
    const p = applyAction(base(), { type: 'set_meta', patch: { languages: ['ha', 'en', 'ha', 'fr'] } }, T1)
    expect(p.meta.languages).toEqual(['en', 'ha', 'fr'])
  })
  it('turns matched logframe lines into selections and keeps earlier decisions', () => {
    let p = applyAction(base(), { type: 'set_indicator', choice: { id: 'GL-SB702/FL', origin: 'suggested', state: 'removed' } }, T1)
    p = applyAction(
      p,
      {
        type: 'import_logframe',
        logframe: {
          imported_on: T1,
          source: 'paste',
          lines: [
            { line: 1, text: 'GL-SB403/FL', status: 'matched', indicator_id: 'GL-SB403/FL', by: 'id' },
            { line: 2, text: 'GL-SB702/FL', status: 'matched', indicator_id: 'GL-SB702/FL', by: 'id' },
            { line: 3, text: 'GS-SB421/FL', status: 'unsupported', indicator_id: 'GS-SB421/FL', by: 'id' },
            { line: 4, text: '# kits', status: 'out_of_scope' },
          ],
        },
      },
      T1,
    )
    expect(p.indicators).toEqual([
      { id: 'GL-SB702/FL', origin: 'suggested', state: 'removed' },
      { id: 'GL-SB403/FL', origin: 'logframe', state: 'selected' },
      { id: 'GS-SB421/FL', origin: 'logframe', state: 'selected' },
    ])
    p = applyAction(p, { type: 'clear_logframe' }, T1)
    expect(p.logframe).toBeUndefined()
    expect(p.indicators.map((c) => c.id)).toEqual(['GL-SB702/FL'])
  })
  it('records visit edits in order and removes or resets them', () => {
    let p = applyAction(base(), { type: 'visit_edit', edit: { op: 'merge', keys: ['a', 'b'] } }, T1)
    p = applyAction(p, { type: 'visit_edit', edit: { op: 'drop', key: 'c' } }, T1)
    p = applyAction(p, { type: 'set_event_settings', key: 'a+b', settings: { margin: 7 } }, T1)
    expect(p.visit_edits.map((e) => e.op)).toEqual(['merge', 'drop'])
    expect(applyAction(p, { type: 'remove_visit_edit', index: 0 }, T1).visit_edits.map((e) => e.op)).toEqual(['drop'])
    const reset = applyAction(p, { type: 'reset_visits' }, T1)
    expect(reset.visit_edits).toEqual([])
    expect(reset.event_settings).toEqual({})
  })
  it('files one content request per indicator', () => {
    let p = applyAction(base(), { type: 'request_content', indicator_id: 'GS-SB421/FL', note: 'Needed for Borno' }, T1)
    p = applyAction(p, { type: 'request_content', indicator_id: 'GS-SB421/FL' }, T1)
    expect(p.content_requests).toHaveLength(1)
    expect(p.content_requests[0]).toMatchObject({ indicator_id: 'GS-SB421/FL', status: 'requested', requested_on: '2026-10-29', sources_allowed: [] })
    expect(applyAction(p, { type: 'withdraw_request', indicator_id: 'GS-SB421/FL' }, T1).content_requests).toEqual([])
  })
})

describe('project file', () => {
  it('round-trips through the exported JSON unchanged', () => {
    const p = applyAction(base(), { type: 'add_activity', activity: act('a1', 'es_nfi_distribution') }, T1)
    const back = parseProjectFile(serializeProject(p))
    expect(back).toEqual({ ok: true, doc: p })
    expect(projectFileName(p)).toBe('maiduguri-es-round-2.mpb.json')
  })
  it('explains a file that is not JSON', () => {
    expect(parseProjectFile('{oops')).toEqual({ ok: false, error: 'The file is not valid JSON.' })
  })
})
