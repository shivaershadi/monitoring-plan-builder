/**
 * The project document: one JSON record per monitoring plan, autosaved to IndexedDB and exportable as a file.
 * Programme settings only; no beneficiary or respondent data, ever.
 * Fields used by later phases (context, strings, edit log, sign-off) are defined now with defaults so a file
 * saved today opens unchanged when those screens arrive.
 */
import { z } from 'zod'
import { LangCode, Proposal } from '@bank/schema/bank'

export const PROJECT_SCHEMA_VERSION = 1

const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date as YYYY-MM-DD')
const Window = z.object({ start: ISODate, end: ISODate })

export const ActivityModality = z.enum(['in-kind', 'CVA'])
export type ActivityModality = z.infer<typeof ActivityModality>

export const ProjectActivity = z.object({
  id: z.string().min(1),
  /** Standard activity from the bank's activity catalogue. */
  activity_id: z.string().min(1),
  package_id: z.string().min(1),
  /** Timing as the user typed it, kept for display. */
  raw_timing: z.string().default(''),
  timing: Window.nullable().default(null),
  /** 'parsed' when the dates came from the typed text, 'picked' when the user set them on the calendar. */
  timing_source: z.enum(['parsed', 'picked']).optional(),
  modalities: z.array(ActivityModality).default([]),
  rounds: z.number().int().positive().optional(),
  populations: z.record(z.string(), z.number().nonnegative()).default({}),
  units: z.number().int().nonnegative().optional(),
  location: z.string().default(''),
  notes: z.string().default(''),
  /** What the user typed when the activity was found through the synonym matcher. */
  free_text: z.string().optional(),
})
export type ProjectActivity = z.infer<typeof ProjectActivity>

export const IndicatorChoice = z.object({
  id: z.string().min(1),
  origin: z.enum(['mandatory', 'suggested', 'logframe']),
  state: z.enum(['selected', 'removed']),
  removal_note: z.string().optional(),
})
export type IndicatorChoice = z.infer<typeof IndicatorChoice>

export const LogframeLine = z.object({
  line: z.number().int().positive(),
  text: z.string(),
  status: z.enum(['matched', 'unsupported', 'unmatched', 'out_of_scope', 'duplicate']),
  indicator_id: z.string().optional(),
  by: z.enum(['id', 'gors_uid', 'title']).optional(),
  score: z.number().optional(),
  alternatives: z.array(z.object({ indicator_id: z.string(), score: z.number() })).optional(),
  reason: z.string().optional(),
})
export const LogframeImport = z.object({
  imported_on: z.string(),
  source: z.enum(['paste', 'file']),
  file_name: z.string().optional(),
  lines: z.array(LogframeLine),
})
export type LogframeImport = z.infer<typeof LogframeImport>

export const VisitEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('merge'), keys: z.tuple([z.string(), z.string()]) }),
  z.object({ op: z.literal('split'), key: z.string(), indicator_ids: z.array(z.string()).min(1) }),
  z.object({ op: z.literal('drop'), key: z.string(), note: z.string().optional() }),
  z.object({ op: z.literal('move'), key: z.string(), window: Window }),
])

const Confidence = z.union([z.literal(90), z.literal(95), z.literal(99)])
export const EventSettingsSchema = z.object({
  confidence: Confidence.optional(),
  margin: z.number().positive().max(20).optional(),
  strata: z.array(z.object({ name: z.string(), population: z.number().int().nonnegative() })).optional(),
})

export const ProjectContext = z.object({
  glossary: z.array(z.object({ term: z.string(), translations: z.record(z.string(), z.string()).default({}), note: z.string().optional() })).default([]),
  contact: z.string().default(''),
  data_protection_statement: z.string().default(''),
  consent: z.object({ kind: z.enum(['verbal', 'written']).default('verbal'), under18: z.boolean().default(false) }).prefault({}),
  typologies: z.array(z.string()).default([]),
  hazards: z.array(z.string()).default([]),
})

export const ProjectMeta = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().default(''),
  area: z.string().default(''),
  /** Ordered; English first. */
  languages: z.array(LangCode).min(1).default(['en']),
  bank_version: z.string(),
  created: z.string(),
  updated: z.string(),
  /** Bumped on sign-off (phase 2). */
  version: z.number().int().nonnegative().default(0),
  mode: z.enum(['builder', 'reviewer', 'adviser']).default('builder'),
  entry: z.enum(['intervention', 'logframe']).default('intervention'),
})

export const ProjectDoc = z.object({
  schema_version: z.literal(PROJECT_SCHEMA_VERSION),
  meta: ProjectMeta,
  activities: z.array(ProjectActivity).default([]),
  indicators: z.array(IndicatorChoice).default([]),
  logframe: LogframeImport.optional(),
  parameters: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  context: ProjectContext.prefault({}),
  sampling: z.object({ confidence: Confidence.default(95), margin: z.number().positive().max(20).default(5) }).prefault({}),
  visit_edits: z.array(VisitEditSchema).default([]),
  event_settings: z.record(z.string(), EventSettingsSchema).default({}),
  /** Phase 3: per-string translations and review state. */
  strings: z.record(z.string(), z.unknown()).default({}),
  /** "Request content" for indicators the bank does not support yet; same record advisers work from. */
  content_requests: z.array(Proposal).default([]),
  /** Phase 3: every edit of an adaptable item. */
  edit_log: z.array(z.record(z.string(), z.unknown())).default([]),
  sign_off: z.object({ name: z.string(), date: z.string(), comment: z.string().optional(), content_hash: z.string() }).optional(),
})
export type ProjectDoc = z.infer<typeof ProjectDoc>
export type ProjectDocInput = z.input<typeof ProjectDoc>

export function newProject(init: {
  id: string
  name: string
  now: string
  bank_version: string
  country?: string
  area?: string
  languages?: string[]
  entry?: 'intervention' | 'logframe'
}): ProjectDoc {
  return ProjectDoc.parse({
    schema_version: PROJECT_SCHEMA_VERSION,
    meta: {
      id: init.id,
      name: init.name,
      country: init.country ?? '',
      area: init.area ?? '',
      languages: init.languages?.length ? init.languages : ['en'],
      bank_version: init.bank_version,
      created: init.now,
      updated: init.now,
      entry: init.entry ?? 'intervention',
    },
  })
}

/** Reads a project from storage or a file, applying defaults; refuses files from a newer version of the app. */
export function readProject(raw: unknown): { ok: true; doc: ProjectDoc } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a project file.' }
  const v = (raw as { schema_version?: unknown }).schema_version
  if (typeof v === 'number' && v > PROJECT_SCHEMA_VERSION) return { ok: false, error: `This project was saved by a newer version of the app (format ${v}). Update the app to open it.` }
  if (v !== PROJECT_SCHEMA_VERSION) return { ok: false, error: 'Not a project file of this app.' }
  const parsed = ProjectDoc.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: `The project file is damaged: ${first.path.join('.') || 'file'}: ${first.message}` }
  }
  return { ok: true, doc: parsed.data }
}
