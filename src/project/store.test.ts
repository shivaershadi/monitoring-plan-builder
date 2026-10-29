import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteProject, listProjects, loadProject, saveProject } from './store'
import { newProject } from './schema'

describe('IndexedDB store', () => {
  it('saves, lists newest first, loads and deletes projects', async () => {
    const a = newProject({ id: 'a', name: 'First', now: '2026-10-01T00:00:00.000Z', bank_version: '2026.10.1' })
    const b = newProject({ id: 'b', name: 'Second', now: '2026-10-02T00:00:00.000Z', bank_version: '2026.10.1', country: 'Nigeria' })
    await saveProject(a, { indicators: 5, events: 2 })
    await saveProject(b, { indicators: 0, events: 0 })
    expect((await listProjects()).map((s) => [s.id, s.name, s.country, s.indicators])).toEqual([
      ['b', 'Second', 'Nigeria', 0],
      ['a', 'First', '', 5],
    ])
    expect(await loadProject('a')).toEqual({ ok: true, doc: a })
    await deleteProject('a')
    expect(await loadProject('a')).toMatchObject({ ok: false })
    expect((await listProjects()).map((s) => s.id)).toEqual(['b'])
  })
  it('overwrites a project saved again under the same id', async () => {
    const p = newProject({ id: 'c', name: 'Draft', now: '2026-10-03T00:00:00.000Z', bank_version: '2026.10.1' })
    await saveProject(p, { indicators: 0, events: 0 })
    await saveProject({ ...p, meta: { ...p.meta, name: 'Final', updated: '2026-10-04T00:00:00.000Z' } }, { indicators: 1, events: 1 })
    const list = await listProjects()
    expect(list.filter((s) => s.id === 'c')).toEqual([{ id: 'c', name: 'Final', country: '', updated: '2026-10-04T00:00:00.000Z', indicators: 1, events: 1 }])
  })
})
