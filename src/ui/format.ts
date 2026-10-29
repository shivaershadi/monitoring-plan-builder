/** Display helpers. Dates are stored as ISO YYYY-MM-DD and shown as "20 Oct 2026". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function fmtRange(w: { start: string; end: string } | null | undefined): string {
  if (!w) return 'no window yet'
  if (w.start === w.end) return fmtDate(w.start)
  const [ys, ms] = w.start.split('-')
  const [ye, me] = w.end.split('-')
  const ds = Number(w.start.slice(8))
  if (ys === ye && ms === me) return `${ds}–${fmtDate(w.end)}`
  if (ys === ye) return `${ds} ${MONTHS[Number(ms) - 1]} – ${fmtDate(w.end)}`
  return `${fmtDate(w.start)} – ${fmtDate(w.end)}`
}

export function monthLabel(y: number, m0: number): string {
  return `${MONTHS[m0]} ${String(y).slice(2)}`
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
