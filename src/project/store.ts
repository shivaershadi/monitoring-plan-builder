/**
 * Projects live in the browser's IndexedDB, on this device only. Nothing is sent anywhere.
 * Each record holds the project document and a small summary for the Home list.
 */
import { readProject, type ProjectDoc } from './schema'

const DB_NAME = 'monitoring-plan-builder'
const DB_VERSION = 1
const STORE = 'projects'

export interface ProjectSummary {
  id: string
  name: string
  country: string
  updated: string
  indicators: number
  events: number
}

interface StoredRecord {
  id: string
  doc: ProjectDoc
  summary: ProjectSummary
}

function idb(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new Error('This browser does not offer IndexedDB, so projects cannot be saved. Export the project file instead.')
  return indexedDB
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb().open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error ?? req.error)
      tx.onabort = () => reject(tx.error ?? new Error('Saving was interrupted.'))
    })
  } finally {
    db.close()
  }
}

export async function saveProject(doc: ProjectDoc, counts: { indicators: number; events: number }): Promise<void> {
  const record: StoredRecord = {
    id: doc.meta.id,
    doc,
    summary: { id: doc.meta.id, name: doc.meta.name, country: doc.meta.country, updated: doc.meta.updated, ...counts },
  }
  await run('readwrite', (s) => s.put(record))
}

export async function loadProject(id: string): Promise<{ ok: true; doc: ProjectDoc } | { ok: false; error: string }> {
  const rec = (await run('readonly', (s) => s.get(id))) as StoredRecord | undefined
  if (!rec) return { ok: false, error: 'This project is no longer on this device.' }
  return readProject(rec.doc)
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const recs = (await run('readonly', (s) => s.getAll())) as StoredRecord[]
  return recs.map((r) => r.summary).sort((a, b) => b.updated.localeCompare(a.updated))
}

export async function deleteProject(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}

/** The project to reopen after a reload. A convenience only: the app works without it. */
const LAST_KEY = 'mpb.lastProject'
export function rememberLastProject(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    /* storage blocked: the user reopens from Home */
  }
}
export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}
