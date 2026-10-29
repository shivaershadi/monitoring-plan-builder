/** Derives the indicator board and the visit plan from a project and the bank. Pure; the screens only render the result. */
import type { BankPackage } from '@bank/schema/bank'
import { buildBoard, selectedIndicatorIds, type ActivityRef, type BoardEntry } from '@engine/selection'
import { planEvents, type PlannedActivity, type PlanResult } from '@engine/planner'
import type { ProjectDoc } from './schema'

export function activityLabel(packages: BankPackage[], packageId: string, activityId: string): string {
  return packages.find((p) => p.package_id === packageId)?.activities.find((a) => a.id === activityId)?.label ?? activityId
}

export function boardFor(doc: ProjectDoc, packages: BankPackage[], opts: { showAll?: boolean } = {}): BoardEntry[] {
  const refs: ActivityRef[] = doc.activities.map((a) => ({ id: a.id, activity_id: a.activity_id, label: activityLabel(packages, a.package_id, a.activity_id), modalities: a.modalities }))
  return buildBoard(packages, refs, doc.indicators, opts)
}

/** One plan per package, concatenated; event keys stay unique because indicator ids are unique across the bank. */
export function planFor(doc: ProjectDoc, packages: BankPackage[], board: BoardEntry[] = boardFor(doc, packages)): PlanResult {
  const selected = selectedIndicatorIds(board)
  const out: PlanResult = { events: [], warnings: [], dropped: [] }
  for (const pkg of packages) {
    const ids = selected.filter((id) => pkg.indicators.some((i) => i.id === id))
    if (!ids.length) continue
    const activities: PlannedActivity[] = doc.activities
      .filter((a) => a.package_id === pkg.package_id)
      .map((a) => ({ id: a.id, activity_id: a.activity_id, label: activityLabel(packages, a.package_id, a.activity_id), timing: a.timing, populations: a.populations, units: a.units, rounds: a.rounds }))
    const r = planEvents({ pkg, selectedIndicatorIds: ids, activities, parameters: doc.parameters, sampling: doc.sampling }, doc.visit_edits, doc.event_settings)
    out.events.push(...r.events)
    out.warnings.push(...r.warnings)
    out.dropped.push(...r.dropped)
  }
  out.events.sort((a, b) => (a.window?.start ?? '9999').localeCompare(b.window?.start ?? '9999') || a.key.localeCompare(b.key))
  out.events.forEach((e, i) => (e.id = `ev_${i + 1}`))
  // An edit that matched no visit in any package is reported once per package that did not apply it; keep one.
  out.warnings = out.warnings.filter((w, i, all) => w.code !== 'edit_not_applied' || all.findIndex((x) => x.message === w.message) === i)
  return out
}
