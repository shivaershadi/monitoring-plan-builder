/**
 * Phase 1 acceptance, engine level: the Emergency Shelter example.
 * Three activities, five mandatory indicators, the planner proposes visits, the user merges two,
 * and the plan survives a save and reload through the project file format.
 */
import { describe, expect, it } from 'vitest'
import { parseTiming } from '@engine/timing'
import { es } from '@engine/test-fixtures'
import { newProject, type ProjectActivity } from './schema'
import { applyAction, type ProjectAction } from './reducer'
import { boardFor, planFor } from './plan'
import { parseProjectFile, serializeProject } from './file'

const TODAY = new Date('2026-10-29T00:00:00Z')
let tick = 0
const now = () => new Date(Date.UTC(2026, 9, 29, 10, 0, tick++)).toISOString()

function activity(id: string, activity_id: string, raw: string, modalities: ProjectActivity['modalities'], households: number): ProjectActivity {
  const t = parseTiming(raw, TODAY)
  if (t.kind === 'unresolved') throw new Error(`timing not understood: ${raw}`)
  return { id, activity_id, package_id: es.package_id, raw_timing: raw, timing: { start: t.start, end: t.end }, timing_source: 'parsed', modalities, populations: { household: households }, location: 'Maiduguri', notes: '' }
}

describe('Phase 1 acceptance: Emergency Shelter example', () => {
  let doc = newProject({ id: 'acc', name: 'Maiduguri emergency shelter 2026', now: now(), bank_version: '2026.10.1', country: 'Nigeria', area: 'Borno', languages: ['en', 'ha'] })
  const act = (a: ProjectAction) => (doc = applyAction(doc, a, now()))

  it('three activities on the canvas lead to the five mandatory indicators, locked', () => {
    act({ type: 'add_activity', activity: activity('a1', 'es_nfi_distribution', '1-20 Sep 2026', ['in-kind', 'CVA'], 1200) })
    act({ type: 'add_activity', activity: activity('a2', 'es_shelter_contribution', '1-10 Nov 2026', ['in-kind', 'CVA'], 600) })
    act({ type: 'add_activity', activity: activity('a3', 'es_whole_shelter', '15 January 2027', ['in-kind'], 500) })
    const board = boardFor(doc, [es])
    const locked = board.filter((e) => e.locked).map((e) => e.indicator.id)
    expect(locked.sort()).toEqual(['GL-SB201/FL', 'GL-SB403/FL', 'GL-SB702/FL', 'GL-SB901/FL', 'GL-SB922/FL'])
  })

  it('the planner proposes one household visit per window, each served and sampled', () => {
    const plan = planFor(doc, [es])
    expect(plan.events.map((e) => [e.window, e.indicator_ids])).toEqual([
      [{ start: '2026-10-20', end: '2026-11-20' }, ['GL-SB702/FL', 'GL-SB922/FL']],
      [{ start: '2026-12-10', end: '2027-01-10' }, ['GL-SB201/FL', 'GL-SB901/FL']],
      [{ start: '2027-02-15', end: '2027-03-15' }, ['GL-SB403/FL']],
    ])
    expect(plan.events.map((e) => e.sampling.n)).toEqual([292, 235, 218])
    expect(plan.warnings.filter((w) => w.level === 'error')).toEqual([])
  })

  it('the user merges the first two visits; the merged visit serves four indicators and flags the late measurement', () => {
    const [first, second] = planFor(doc, [es]).events
    act({ type: 'visit_edit', edit: { op: 'merge', keys: [first.key, second.key] } })
    const plan = planFor(doc, [es])
    expect(plan.events).toHaveLength(2)
    expect(plan.events[0]).toMatchObject({ origin: 'merged', window: { start: '2026-12-10', end: '2027-01-10' } })
    expect(plan.events[0].indicator_ids.sort()).toEqual(['GL-SB201/FL', 'GL-SB702/FL', 'GL-SB901/FL', 'GL-SB922/FL'])
    expect(plan.events[0].sampling.frame).toBe(1200)
    expect(plan.warnings.filter((w) => w.code === 'outside_window').map((w) => w.indicator_id).sort()).toEqual(['GL-SB702/FL', 'GL-SB922/FL'])
  })

  it('the plan survives a reload: the saved file reopens to the same board and visits', () => {
    const before = planFor(doc, [es])
    const reopened = parseProjectFile(serializeProject(doc))
    if (!reopened.ok) throw new Error(reopened.error)
    expect(reopened.doc).toEqual(doc)
    expect(planFor(reopened.doc, [es])).toEqual(before)
  })
})
