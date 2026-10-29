/**
 * Indicator board: which indicators apply to the activities on the canvas, which are pre-selected and locked,
 * and why each is shown. Pure; content rules (applicability, modality, bundles) come from the bank.
 */
import type { BankPackage, Indicator } from '@bank/schema/bank'

export interface ActivityRef {
  id: string
  activity_id: string
  label: string
  modalities: Array<'in-kind' | 'CVA'>
}

export interface IndicatorDecision {
  id: string
  origin: 'mandatory' | 'suggested' | 'logframe'
  state: 'selected' | 'removed'
  removal_note?: string
}

export interface BoardEntry {
  indicator: Indicator
  package_id: string
  /** Canvas activities that serve the indicator with a matching modality. */
  serving: ActivityRef[]
  /** Canvas activities that would serve it with another modality. */
  other_modality: ActivityRef[]
  applies: boolean
  origin: 'mandatory' | 'suggested' | 'logframe'
  from_logframe: boolean
  selected: boolean
  locked: boolean
  removed: boolean
  removal_note?: string
  supported: boolean
  /** Bundle partners that pre-selected this indicator. */
  bundled_by: string[]
  reason: string
}

function serves(ind: Indicator, pkg: BankPackage, a: ActivityRef): boolean {
  const def = pkg.activities.find((x) => x.id === a.activity_id)
  if (!def) return false
  if (ind.applicability.length) return ind.applicability.includes(a.activity_id)
  return def.results.includes(ind.result)
}

function modalityMatches(ind: Indicator, a: ActivityRef): boolean {
  return ind.modality === 'any' || a.modalities.includes(ind.modality)
}

const names = (as: ActivityRef[]) => [...new Set(as.map((a) => a.label))].join('; ')

export function buildBoard(packages: BankPackage[], activities: ActivityRef[], decisions: IndicatorDecision[], opts: { showAll?: boolean } = {}): BoardEntry[] {
  const decided = new Map(decisions.map((d) => [d.id, d]))
  const entries: BoardEntry[] = []

  for (const pkg of packages) {
    for (const ind of pkg.indicators) {
      const related = activities.filter((a) => serves(ind, pkg, a))
      const serving = related.filter((a) => modalityMatches(ind, a))
      const other = related.filter((a) => !modalityMatches(ind, a))
      const d = decided.get(ind.id)
      const applies = serving.length > 0
      const mandatory = ind.status === 'mandatory' && applies
      const removed = d?.state === 'removed'
      const fromLogframe = d?.origin === 'logframe'
      const selected = !removed && (mandatory || d?.state === 'selected')
      const supported = ind.support === 'supported'
      let reason: string
      if (mandatory) reason = `Mandatory for ${names(serving)}.`
      else if (fromLogframe) reason = applies ? `From your logframe; serves ${names(serving)}.` : 'From your logframe. No activity on the canvas serves it yet.'
      else if (applies) reason = `Suggested for ${names(serving)}.`
      else if (other.length) reason = `For ${ind.modality}; ${names(other)} is set to ${[...new Set(other.flatMap((a) => a.modalities))].join(' and ') || 'no modality'}.`
      else reason = 'No activity on the canvas serves it.'
      entries.push({
        indicator: ind,
        package_id: pkg.package_id,
        serving,
        other_modality: other,
        applies,
        origin: mandatory ? 'mandatory' : fromLogframe ? 'logframe' : 'suggested',
        from_logframe: fromLogframe,
        selected,
        locked: mandatory && !removed,
        removed,
        removal_note: d?.removal_note,
        supported,
        bundled_by: [],
        reason,
      })
    }
  }

  // Bundles: a selected indicator pre-selects partners it pairs with or requires (removal needs a note).
  const byId = new Map(entries.map((e) => [e.indicator.id, e]))
  for (const e of entries) {
    if (!e.selected) continue
    for (const b of e.indicator.bundles) {
      if (b.relation !== 'pairs_with' && b.relation !== 'requires') continue
      const partner = byId.get(b.indicator_id)
      if (!partner || partner.removed) continue
      if (!partner.selected) {
        partner.selected = true
        partner.reason = `Bundled with ${e.indicator.id}${b.note ? `: ${b.note}` : '.'}`
      }
      partner.bundled_by.push(e.indicator.id)
    }
  }

  return entries.filter((e) => opts.showAll || e.applies || e.selected || e.removed || e.from_logframe || e.other_modality.length > 0)
}

export function selectedIndicatorIds(board: BoardEntry[]): string[] {
  return board.filter((e) => e.selected).map((e) => e.indicator.id)
}

/** For the canvas hint: what the current activities lead to. */
export function coverage(board: BoardEntry[]) {
  const applying = board.filter((e) => e.applies)
  return {
    tocs: [...new Set(applying.map((e) => `${e.package_id}:${e.indicator.toc}`))].length,
    mandatory: applying.filter((e) => e.indicator.status === 'mandatory').length,
    suggested: applying.filter((e) => e.indicator.status === 'suggested').length,
    not_supported: applying.filter((e) => !e.supported).length,
  }
}
