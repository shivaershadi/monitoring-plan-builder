/**
 * Free-text activity to standard activity, by the bank's synonym table (replaces the AI "map activity" assist).
 * A suggestion is only ever shown for the user to confirm.
 */
import type { Activity, BankPackage } from '@bank/schema/bank'
import { containment, tokens } from './text'

export interface ActivitySuggestion {
  activity: Activity
  package_id: string
  score: number
  /** The label or synonym that matched best. */
  matched: string
}

export const ACTIVITY_MATCH_THRESHOLD = 0.6

export function suggestActivities(text: string, packages: BankPackage[], limit = 3): ActivitySuggestion[] {
  const words = tokens(text)
  if (!words.length) return []
  const out: Array<ActivitySuggestion & { shared: number }> = []
  for (const pkg of packages) {
    for (const activity of pkg.activities) {
      let best = { score: 0, matched: '', shared: 0 }
      for (const phrase of [activity.label, activity.area_of_work ?? '', ...activity.synonyms]) {
        const p = tokens(phrase)
        if (!p.length) continue
        const score = containment(p, words)
        const shared = Math.round(score * p.length)
        if (score > best.score || (score === best.score && shared > best.shared)) best = { score, matched: phrase, shared }
      }
      if (best.score >= ACTIVITY_MATCH_THRESHOLD) out.push({ activity, package_id: pkg.package_id, score: best.score, matched: best.matched, shared: best.shared })
    }
  }
  return out
    .sort((a, b) => b.score - a.score || b.shared - a.shared)
    .slice(0, limit)
    .map(({ shared: _shared, ...s }) => s)
}
