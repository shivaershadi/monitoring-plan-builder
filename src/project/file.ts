/** Project file export and import (JSON). The file is the way a project travels between people and devices. */
import { readProject, type ProjectDoc } from './schema'

export function projectFileName(doc: ProjectDoc): string {
  const slug = doc.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
  return `${slug}.mpb.json`
}

export function serializeProject(doc: ProjectDoc): string {
  return JSON.stringify(doc, null, 2) + '\n'
}

export function parseProjectFile(text: string): { ok: true; doc: ProjectDoc } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
  return readProject(raw)
}

/** Starts a download of the given text in the browser. No network: the file is built in memory. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
