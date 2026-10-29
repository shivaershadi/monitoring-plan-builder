/**
 * Deterministic text matching used by the logframe importer and the activity matcher.
 * Lower-case, accents folded, punctuation dropped, stop words removed, plurals reduced. No model, no dictionary service.
 */

const STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'by', 'at', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'we', 'our', 'us', 'they', 'their', 'who', 'that', 'which', 'this', 'these', 'it', 'its', 'from', 'into', 'per', 'within', 'after',
  'versus', 'vs', 'etc', 'e', 'g', 'eg', 'i', 'ie', 'out', 'gave', 'give', 'given', 'did', 'do', 'done', 'have', 'has', 'had',
])

function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y'
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1)
  return t
}

export function tokens(text: string): string[] {
  return text
    .replace(/\{[^}]*\}/g, ' ') // template placeholders such as {recall_window}
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map(stem)
}

/** Sørensen–Dice coefficient over token sets: 2|A∩B| / (|A|+|B|). 1 = same words, 0 = none shared. */
export function dice(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return (2 * shared) / (A.size + B.size)
}

/** Share of the phrase's tokens that appear in the text (1 = the whole phrase is there). */
export function containment(phrase: string[], text: string[]): number {
  const P = new Set(phrase)
  const T = new Set(text)
  if (!P.size) return 0
  let shared = 0
  for (const t of P) if (T.has(t)) shared++
  return shared / P.size
}
