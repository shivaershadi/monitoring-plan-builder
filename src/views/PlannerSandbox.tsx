/**
 * Phase 0 milestone: the visit planner working end to end on the Emergency Shelter indicators with
 * user-entered activity timings. The real intervention canvas replaces the inputs here in phase 1.
 */
import { useMemo, useState } from 'react'
import type { Bank } from '../bank/loader'
import { planEvents, type PlannedActivity } from '@engine/planner'
import { describeTiming, parseTiming } from '@engine/timing'

interface Row { activity_id: string; raw: string; population: string; units: string }

export function PlannerSandbox({ bank }: { bank: Bank }) {
  const pkg = bank.packages[0]
  const [rows, setRows] = useState<Row[]>([
    { activity_id: 'es_whole_shelter', raw: '30 Oct 2026', population: '500', units: '500' },
    { activity_id: 'es_nfi_distribution', raw: '1–20 Sep 2026', population: '1200', units: '' },
  ])
  const [selected, setSelected] = useState<string[]>(['GL-SB403/FL', 'GL-SB702/FL'])
  const [window, setWindow] = useState('1 month')

  const activities: PlannedActivity[] = useMemo(
    () =>
      rows.map((r, i) => {
        const t = parseTiming(r.raw)
        const populations: Record<string, number> = {}
        if (r.population) populations.household = Number(r.population)
        return {
          id: String(i),
          activity_id: r.activity_id,
          label: pkg?.activities.find((a) => a.id === r.activity_id)?.label ?? r.activity_id,
          timing: t.kind === 'unresolved' ? null : { start: t.start, end: t.end },
          populations,
          units: r.units ? Number(r.units) : undefined,
        }
      }),
    [rows, pkg],
  )

  const plan = useMemo(() => {
    if (!pkg) return { events: [], warnings: [] }
    const parameters = Object.fromEntries(selected.map((id) => [id, { occupancy_window: window, recall_window: window }]))
    return planEvents({ pkg, selectedIndicatorIds: selected, activities, parameters })
  }, [pkg, selected, activities, window])

  if (!pkg) return <p>No bank package loaded.</p>

  return (
    <div>
      <h1 className="text-xl font-bold">Visits (sandbox)</h1>
      <p className="mb-4 text-stone-500">Type activity timings as you would say them. The planner derives the windows from the indicators' timing rules and groups items into events.</p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Activities</h2>
          {rows.map((r, i) => {
            const t = parseTiming(r.raw)
            return (
              <div key={i} className="mb-3 rounded-lg border border-stone-200 p-2">
                <select className="input mb-1" value={r.activity_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, activity_id: e.target.value } : x)))}>
                  {pkg.activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-1">
                  <input className="input" placeholder="timing, e.g. 1–20 Sep 2026" value={r.raw} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, raw: e.target.value } : x)))} aria-label="timing" />
                  <input className="input" placeholder="households" value={r.population} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, population: e.target.value } : x)))} aria-label="population" />
                  <input className="input" placeholder="units" value={r.units} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, units: e.target.value } : x)))} aria-label="units" />
                </div>
                <div className={`mt-1 text-xs ${t.kind === 'unresolved' ? 'text-amber-700' : 'text-green-700'}`}>We understood: {describeTiming(t)}</div>
              </div>
            )
          })}
          <button className="btn" onClick={() => setRows([...rows, { activity_id: pkg.activities[0].id, raw: '', population: '', units: '' }])}>+ Add activity</button>
          <h2 className="mb-2 mt-4 font-semibold">Indicators</h2>
          {pkg.indicators.map((i) => (
            <label key={i.id} className={`flex items-start gap-2 py-1 text-sm ${i.support !== 'supported' ? 'opacity-50' : ''}`}>
              <input type="checkbox" checked={selected.includes(i.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
              <span><b>{i.id}</b> <span className="chip bg-stone-200 text-stone-700">{i.status}</span> <span className="text-stone-600">{i.title_template}</span></span>
            </label>
          ))}
          <label className="mt-3 block text-sm">Measurement window parameter <input className="input mt-1" value={window} onChange={(e) => setWindow(e.target.value)} /></label>
        </section>
        <section>
          <div className="card mb-4">
            <h2 className="mb-2 font-semibold">Proposed events</h2>
            {plan.events.length === 0 && <p className="text-sm text-stone-500">No events yet. Select a supported indicator and give its activity a timing.</p>}
            {plan.events.map((e) => (
              <div key={e.id} className="mb-2 rounded-lg border-l-4 border-nrc bg-stone-50 p-2 text-sm">
                <div className="flex items-center justify-between"><b>{e.label}</b><span className={`chip ${e.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{e.status === 'ready' ? 'ready' : 'needs attention'}</span></div>
                <div className="text-xs text-stone-600">
                  Window: {e.window ? `${e.window.start} to ${e.window.end}` : 'unknown'} · Serves: {e.indicator_ids.join(', ')} · {e.item_count} items ≈ {e.estimated_minutes} min
                </div>
                <div className="text-xs text-stone-600">
                  Sampling: {e.sampling.frame ? (e.sampling.census ? `all ${e.sampling.frame} units (census)` : `n = ${e.sampling.n} of ${e.sampling.frame} (95% / 5%)`) : 'no population given'} · Modules: {e.module_ids.join(', ')}
                </div>
                {e.notes.map((n) => <div key={n} className="text-xs text-amber-700">{n}</div>)}
              </div>
            ))}
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Warnings</h2>
            {plan.warnings.length === 0 && <p className="text-sm text-green-700">Every selected indicator is served by at least one event.</p>}
            <ul className="text-sm">
              {plan.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 border-b border-stone-100 py-1"><span className={`chip ${w.level === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{w.level === 'error' ? 'Attention' : 'To review'}</span><span>{w.message}</span></li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
