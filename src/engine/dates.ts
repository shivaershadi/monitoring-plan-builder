/** Date helpers on ISO 'YYYY-MM-DD' strings; UTC-only to avoid timezone drift. */
import type { Duration } from '@bank/schema/bank'

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export function addDuration(iso: string, dur: Duration, sign: 1 | -1 = 1): string {
  const d = fromISO(iso)
  const v = dur.value * sign
  if (dur.unit === 'days') d.setUTCDate(d.getUTCDate() + v)
  else if (dur.unit === 'weeks') d.setUTCDate(d.getUTCDate() + v * 7)
  else {
    const whole = Math.trunc(v)
    const frac = v - whole
    d.setUTCMonth(d.getUTCMonth() + whole)
    if (frac) d.setUTCDate(d.getUTCDate() + Math.round(frac * 30))
  }
  return toISO(d)
}
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000)
}
export function maxISO(a: string, b: string): string {
  return a >= b ? a : b
}
export function minISO(a: string, b: string): string {
  return a <= b ? a : b
}
export function endOfMonth(y: number, m1: number): string {
  return toISO(new Date(Date.UTC(y, m1, 0)))
}
export function overlap(a: { start: string; end: string }, b: { start: string; end: string }): { start: string; end: string } | null {
  const s = maxISO(a.start, b.start)
  const e = minISO(a.end, b.end)
  return s <= e ? { start: s, end: e } : null
}
