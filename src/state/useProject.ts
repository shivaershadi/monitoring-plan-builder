/**
 * The open project: one document in memory, changed only through reducer actions, autosaved to IndexedDB
 * a moment after each change. Reloading the page reopens the last project from the same storage.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bank } from '../bank/loader'
import { selectedIndicatorIds } from '@engine/selection'
import { applyAction, type ProjectAction } from '../project/reducer'
import { newProject, type ProjectDoc } from '../project/schema'
import { boardFor, planFor } from '../project/plan'
import { deleteProject, lastProjectId, listProjects, loadProject, rememberLastProject, saveProject, type ProjectSummary } from '../project/store'
import { parseProjectFile } from '../project/file'
import { newId } from '../ui/format'

export type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: string } | { state: 'error'; message: string }

async function persist(doc: ProjectDoc, bank: Bank) {
  const board = boardFor(doc, bank.packages)
  const plan = planFor(doc, bank.packages, board)
  await saveProject(doc, { indicators: selectedIndicatorIds(board).length, events: plan.events.length })
}

export function useProject(bank: Bank) {
  const [doc, setDoc] = useState<ProjectDoc | null>(null)
  const [save, setSave] = useState<SaveState>({ state: 'idle' })
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [storageError, setStorageError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const lastSaved = useRef<ProjectDoc | null>(null)

  const refreshList = useCallback(async () => {
    try {
      setProjects(await listProjects())
      setStorageError(null)
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // On start: list projects and reopen the one that was open before the reload.
  useEffect(() => {
    void (async () => {
      await refreshList()
      const id = lastProjectId()
      if (id) {
        try {
          const r = await loadProject(id)
          if (r.ok) {
            lastSaved.current = r.doc
            setDoc(r.doc)
            setSave({ state: 'saved', at: r.doc.meta.updated })
          } else rememberLastProject(null)
        } catch {
          rememberLastProject(null)
        }
      }
      setReady(true)
    })()
  }, [refreshList])

  // Autosave shortly after each change.
  useEffect(() => {
    if (!doc || doc === lastSaved.current) return
    setSave({ state: 'saving' })
    const t = setTimeout(() => {
      persist(doc, bank)
        .then(() => {
          lastSaved.current = doc
          setSave({ state: 'saved', at: new Date().toISOString() })
          void refreshList()
        })
        .catch((e) => setSave({ state: 'error', message: e instanceof Error ? e.message : String(e) }))
    }, 250)
    return () => clearTimeout(t)
  }, [doc, bank, refreshList])

  const dispatch = useCallback((a: ProjectAction) => setDoc((d) => (d ? applyAction(d, a, new Date().toISOString()) : d)), [])

  const openDoc = useCallback((d: ProjectDoc, saved: boolean) => {
    lastSaved.current = saved ? d : null
    setDoc(d)
    setSave(saved ? { state: 'saved', at: d.meta.updated } : { state: 'saving' })
    rememberLastProject(d.meta.id)
  }, [])

  const create = useCallback(
    (init: { name: string; country: string; area: string; languages: string[]; entry: 'intervention' | 'logframe' }) => {
      const d = newProject({ id: newId(), now: new Date().toISOString(), bank_version: bank.release.version, ...init })
      openDoc(d, false)
      return d
    },
    [bank.release.version, openDoc],
  )

  const open = useCallback(
    async (id: string): Promise<string | null> => {
      const r = await loadProject(id)
      if (!r.ok) return r.error
      openDoc(r.doc, true)
      return null
    },
    [openDoc],
  )

  /** Imports a project file. An imported project replaces one with the same id on this device. */
  const importText = useCallback(
    (text: string): string | null => {
      const r = parseProjectFile(text)
      if (!r.ok) return r.error
      openDoc(r.doc, false)
      return null
    },
    [openDoc],
  )

  const close = useCallback(() => {
    setDoc(null)
    setSave({ state: 'idle' })
    rememberLastProject(null)
    void refreshList()
  }, [refreshList])

  const remove = useCallback(
    async (id: string) => {
      await deleteProject(id)
      if (doc?.meta.id === id) close()
      await refreshList()
    },
    [doc, close, refreshList],
  )

  return { doc, dispatch, save, projects, storageError, ready, create, open, importText, close, remove }
}
