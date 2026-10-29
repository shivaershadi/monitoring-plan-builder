/**
 * Every change to a project is one action applied by this pure function. The UI dispatches actions; the
 * autosave writes the result. `now` is passed in so the reducer stays deterministic and testable.
 */
import type { VisitEdit } from '@engine/visits'
import type { EventSettings } from '@engine/planner'
import type { IndicatorChoice, LogframeImport, ProjectActivity, ProjectDoc } from './schema'

export type ProjectAction =
  | { type: 'set_meta'; patch: Partial<Pick<ProjectDoc['meta'], 'name' | 'country' | 'area' | 'languages' | 'mode'>> }
  | { type: 'add_activity'; activity: ProjectActivity }
  | { type: 'update_activity'; id: string; patch: Partial<Omit<ProjectActivity, 'id'>> }
  | { type: 'remove_activity'; id: string }
  | { type: 'set_indicator'; choice: IndicatorChoice }
  | { type: 'clear_indicator'; id: string }
  | { type: 'import_logframe'; logframe: LogframeImport }
  | { type: 'clear_logframe' }
  | { type: 'visit_edit'; edit: VisitEdit }
  | { type: 'remove_visit_edit'; index: number }
  | { type: 'reset_visits' }
  | { type: 'set_sampling'; sampling: ProjectDoc['sampling'] }
  | { type: 'set_event_settings'; key: string; settings: EventSettings | null }
  | { type: 'request_content'; indicator_id: string; requested_by?: string; note?: string }
  | { type: 'withdraw_request'; indicator_id: string }

export function applyAction(doc: ProjectDoc, action: ProjectAction, now: string): ProjectDoc {
  const next = reduce(doc, action, now)
  return next === doc ? doc : { ...next, meta: { ...next.meta, updated: now } }
}

function reduce(doc: ProjectDoc, a: ProjectAction, now: string): ProjectDoc {
  switch (a.type) {
    case 'set_meta': {
      const patch = { ...a.patch }
      if (patch.name !== undefined && !patch.name.trim()) delete patch.name
      // English is always present and first.
      if (patch.languages) patch.languages = ['en', ...patch.languages.filter((l) => l !== 'en').filter((l, i, arr) => arr.indexOf(l) === i)]
      return { ...doc, meta: { ...doc.meta, ...patch } }
    }
    case 'add_activity':
      return { ...doc, activities: [...doc.activities, a.activity] }
    case 'update_activity':
      return { ...doc, activities: doc.activities.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) }
    case 'remove_activity':
      return { ...doc, activities: doc.activities.filter((x) => x.id !== a.id) }
    case 'set_indicator': {
      if (a.choice.state === 'removed' && a.choice.origin === 'mandatory' && !a.choice.removal_note?.trim()) return doc
      const rest = doc.indicators.filter((c) => c.id !== a.choice.id)
      return { ...doc, indicators: [...rest, a.choice] }
    }
    case 'clear_indicator':
      return { ...doc, indicators: doc.indicators.filter((c) => c.id !== a.id) }
    case 'import_logframe': {
      // Matched and listed-but-unsupported lines become logframe-origin selections; earlier decisions are kept.
      const ids = a.logframe.lines.filter((l) => (l.status === 'matched' || l.status === 'unsupported') && l.indicator_id).map((l) => l.indicator_id!)
      const existing = new Map(doc.indicators.map((c) => [c.id, c]))
      const added: IndicatorChoice[] = ids.filter((id) => !existing.has(id)).map((id) => ({ id, origin: 'logframe', state: 'selected' }))
      return { ...doc, logframe: a.logframe, indicators: [...doc.indicators, ...added] }
    }
    case 'clear_logframe':
      return { ...doc, logframe: undefined, indicators: doc.indicators.filter((c) => c.origin !== 'logframe') }
    case 'visit_edit':
      return { ...doc, visit_edits: [...doc.visit_edits, a.edit] }
    case 'remove_visit_edit':
      return { ...doc, visit_edits: doc.visit_edits.filter((_, i) => i !== a.index) }
    case 'reset_visits':
      return { ...doc, visit_edits: [], event_settings: {} }
    case 'set_sampling':
      return { ...doc, sampling: a.sampling }
    case 'set_event_settings': {
      const event_settings = { ...doc.event_settings }
      if (a.settings) event_settings[a.key] = a.settings
      else delete event_settings[a.key]
      return { ...doc, event_settings }
    }
    case 'request_content': {
      if (doc.content_requests.some((r) => r.indicator_id === a.indicator_id && r.status !== 'rejected')) return doc
      return {
        ...doc,
        content_requests: [
          ...doc.content_requests,
          {
            id: `req_${a.indicator_id.replace(/[^A-Za-z0-9]+/g, '_')}_${now.slice(0, 10)}`,
            indicator_id: a.indicator_id,
            requested_by: a.requested_by,
            requested_on: now.slice(0, 10),
            sources_allowed: [],
            status: 'requested',
            draft_modules: [],
            decisions: a.note ? [{ by: a.requested_by ?? 'country office', on: now.slice(0, 10), decision: 'requested', note: a.note }] : [],
          },
        ],
      }
    }
    case 'withdraw_request':
      return { ...doc, content_requests: doc.content_requests.filter((r) => !(r.indicator_id === a.indicator_id && r.status === 'requested')) }
  }
}
