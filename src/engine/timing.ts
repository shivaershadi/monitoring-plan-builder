/**
 * Deterministic, offline parser for free-text activity timing.
 * Returns a standardised value plus the raw text; the UI shows "We understood: …" for confirmation.
 * Vague expressions ("after the rains") come back as kind 'unresolved' so the UI asks for dates.
 */
import { endOfMonth, toISO } from './dates'

export type Timing =
  | { kind: 'date'; start: string; end: string; raw: string; confidence: 'high' | 'medium' }
  | { kind: 'period'; start: string; end: string; raw: string; confidence: 'high' | 'medium' }
  | { kind: 'unresolved'; raw: string; hint: string }

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}
function inferYear(m: number, today: Date): number {
  // Months without a year: nearest occurrence within -6/+6 months of today.
  const y = today.getUTCFullYear()
  const diff = m - (today.getUTCMonth() + 1)
  if (diff < -6) return y + 1
  if (diff > 6) return y - 1
  return y
}
function validDay(y: number, m: number, d: number) {
  return m >= 1 && m <= 12 && d >= 1 && d <= Number(endOfMonth(y, m).slice(8, 10))
}

export function parseTiming(raw: string, today: Date = new Date()): Timing {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!text) return { kind: 'unresolved', raw, hint: 'Enter a date or a period, for example "15 March 2027" or "1–20 Sep 2026".' }

  // ISO date or ISO range
  const isoRange = text.match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|-|–|—|until|through)\s*(\d{4}-\d{2}-\d{2})$/)
  if (isoRange) return { kind: 'period', start: isoRange[1], end: isoRange[2], raw, confidence: 'high' }
  const isoOne = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoOne) {
    const [y, m, d] = [Number(isoOne[1]), Number(isoOne[2]), Number(isoOne[3])]
    if (validDay(y, m, d)) return { kind: 'date', start: iso(y, m, d), end: iso(y, m, d), raw, confidence: 'high' }
  }

  // Numeric d/m/y or d.m.y (day first; this is NRC usage, not US)
  const dmy = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmy) {
    const [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])]
    if (validDay(y, m, d)) return { kind: 'date', start: iso(y, m, d), end: iso(y, m, d), raw, confidence: 'medium' }
  }

  // "1–15 sep 2026", "1 to 20 september 2026", "1-20 sept" (year inferred)
  const dayRange = text.match(new RegExp(`^(\\d{1,2})\\s*(?:to|-|–|—|until|through)\\s*(\\d{1,2})\\s*${MONTH_RE}\\.?(?:\\s+(\\d{4}))?$`))
  if (dayRange) {
    const m = MONTHS[dayRange[3]]
    const y = dayRange[4] ? Number(dayRange[4]) : inferYear(m, today)
    const d1 = Number(dayRange[1])
    const d2 = Number(dayRange[2])
    if (validDay(y, m, d1) && validDay(y, m, d2) && d1 <= d2)
      return { kind: 'period', start: iso(y, m, d1), end: iso(y, m, d2), raw, confidence: dayRange[4] ? 'high' : 'medium' }
  }

  // "15 march 2027" / "15 mar" / "march 15, 2027" / "15th of march 2027"
  const dMonY = text.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?$`))
  const monDY = text.match(new RegExp(`^${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`))
  const single = dMonY ? { d: Number(dMonY[1]), m: MONTHS[dMonY[2]], y: dMonY[3] } : monDY ? { d: Number(monDY[2]), m: MONTHS[monDY[1]], y: monDY[3] } : null
  if (single) {
    const y = single.y ? Number(single.y) : inferYear(single.m, today)
    if (validDay(y, single.m, single.d))
      return { kind: 'date', start: iso(y, single.m, single.d), end: iso(y, single.m, single.d), raw, confidence: single.y ? 'high' : 'medium' }
  }

  // Month range: "march to may 2027", "mar–may 2027", "oct 2026 - jan 2027"
  const monRange = text.match(new RegExp(`^${MONTH_RE}\\.?(?:\\s+(\\d{4}))?\\s*(?:to|-|–|—|until|through)\\s*${MONTH_RE}\\.?(?:\\s+(\\d{4}))?$`))
  if (monRange) {
    const m1 = MONTHS[monRange[1]]
    const m2 = MONTHS[monRange[3]]
    const y2 = monRange[4] ? Number(monRange[4]) : monRange[2] ? Number(monRange[2]) + (m2 < m1 ? 1 : 0) : inferYear(m2, today)
    const y1 = monRange[2] ? Number(monRange[2]) : y2 - (m2 < m1 ? 1 : 0)
    return { kind: 'period', start: iso(y1, m1, 1), end: endOfMonth(y2, m2), raw, confidence: monRange[2] || monRange[4] ? 'high' : 'medium' }
  }

  // Whole month: "march 2027", "sept"
  const mon = text.match(new RegExp(`^${MONTH_RE}\\.?(?:\\s+(\\d{4}))?$`))
  if (mon) {
    const m = MONTHS[mon[1]]
    const y = mon[2] ? Number(mon[2]) : inferYear(m, today)
    return { kind: 'period', start: iso(y, m, 1), end: endOfMonth(y, m), raw, confidence: mon[2] ? 'high' : 'medium' }
  }

  // Quarters and halves: "q1 2027", "first quarter 2027", "h2 2026"
  const q = text.match(/^(?:q([1-4])|(first|second|third|fourth) quarter)(?:\s+(?:of\s+)?(\d{4}))?$/)
  if (q) {
    const n = q[1] ? Number(q[1]) : ['first', 'second', 'third', 'fourth'].indexOf(q[2]) + 1
    const y = q[3] ? Number(q[3]) : today.getUTCFullYear()
    const m1 = (n - 1) * 3 + 1
    return { kind: 'period', start: iso(y, m1, 1), end: endOfMonth(y, m1 + 2), raw, confidence: q[3] ? 'high' : 'medium' }
  }
  const h = text.match(/^(?:h([12])|(first|second) half)(?:\s+(?:of\s+)?(\d{4}))?$/)
  if (h) {
    const n = h[1] ? Number(h[1]) : h[2] === 'first' ? 1 : 2
    const y = h[3] ? Number(h[3]) : today.getUTCFullYear()
    return { kind: 'period', start: iso(y, n === 1 ? 1 : 7, 1), end: endOfMonth(y, n === 1 ? 6 : 12), raw, confidence: h[3] ? 'high' : 'medium' }
  }

  // Early / mid / late / first half / second half / first N weeks of a month
  const part = text.match(new RegExp(`^(early|mid|mid-|middle of|late|end of|beginning of|start of|first half of|second half of|first (?:two|three|2|3) weeks of|last (?:two|2) weeks of)\\s*${MONTH_RE}\\.?(?:\\s+(\\d{4}))?$`))
  if (part) {
    const m = MONTHS[part[2]]
    const y = part[3] ? Number(part[3]) : inferYear(m, today)
    const last = Number(endOfMonth(y, m).slice(8, 10))
    const p = part[1]
    let s = 1
    let e = last
    if (/^(early|beginning|start)/.test(p)) [s, e] = [1, 10]
    else if (/^mid/.test(p)) [s, e] = [11, 20]
    else if (/^(late|end)/.test(p)) [s, e] = [21, last]
    else if (p.startsWith('first half')) [s, e] = [1, 15]
    else if (p.startsWith('second half')) [s, e] = [16, last]
    else if (/first (two|2) weeks/.test(p)) [s, e] = [1, 14]
    else if (/first (three|3) weeks/.test(p)) [s, e] = [1, 21]
    else if (/last (two|2) weeks/.test(p)) [s, e] = [last - 13, last]
    return { kind: 'period', start: iso(y, m, s), end: iso(y, m, e), raw, confidence: 'medium' }
  }

  // "today"
  if (text === 'today') {
    const t = toISO(today)
    return { kind: 'date', start: t, end: t, raw, confidence: 'high' }
  }

  return { kind: 'unresolved', raw, hint: 'Could not read a date or period. Pick the dates on the calendar; the original text is kept for display.' }
}

export function describeTiming(t: Timing): string {
  if (t.kind === 'unresolved') return `Not understood: "${t.raw}"`
  if (t.kind === 'date') return `a date: ${t.start}`
  return `a period: ${t.start} to ${t.end}`
}
