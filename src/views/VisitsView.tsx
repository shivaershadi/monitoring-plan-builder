import { useMemo, useState } from 'react'
import type { Bank } from '../bank/loader'
import { labelMode, labelRespondent, type Confidence, type PlannedEvent, type PlanWarning } from '@engine/planner'
import type { VisitEdit } from '@engine/visits'
import type { ProjectAction } from '../project/reducer'
import type { ProjectDoc } from '../project/schema'
import { boardFor, planFor } from '../project/plan'
import { fmtRange, monthLabel, plural } from '../ui/format'

interface Props {
  bank: Bank
  doc: ProjectDoc
  dispatch: (a: ProjectAction) => void
  readOnly: boolean
}

const CONFIDENCES: Confidence[] = [90, 95, 99]
const MARGINS = [3, 5, 7, 10]

export function VisitsView({ bank, doc, dispatch, readOnly }: Props) {
  const plan = useMemo(() => planFor(doc, bank.packages, boardFor(doc, bank.packages)), [doc, bank])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = plan.events.find((e) => e.key === selectedKey) ?? plan.events[0] ?? null

  return (
    <div>
      <h1 className="text-xl font-bold">Visits</h1>
      <p className="mb-4 text-stone-500">Proposed from the indicators' respondents, methods and timing rules. Merge, split, move or drop a visit; your changes are kept when the plan is recalculated.</p>
      <fieldset disabled={readOnly} className="min-w-0">
        <section className="card mb-4 flex flex-wrap items-end gap-4">
          <div>
            <h2 className="font-semibold">Sampling for every visit</h2>
            <p className="text-xs text-stone-500">Simple random sampling, Cochran with finite-population correction. A visit can override this below.</p>
          </div>
          <label className="field mb-0">
            <span>Confidence</span>
            <select className="input w-auto" value={doc.sampling.confidence} onChange={(e) => dispatch({ type: 'set_sampling', sampling: { ...doc.sampling, confidence: Number(e.target.value) as Confidence } })}>
              {CONFIDENCES.map((c) => <option key={c} value={c}>{c}%</option>)}
            </select>
          </label>
          <label className="field mb-0">
            <span>Margin of error</span>
            <select className="input w-auto" value={doc.sampling.margin} onChange={(e) => dispatch({ type: 'set_sampling', sampling: { ...doc.sampling, margin: Number(e.target.value) } })}>
              {MARGINS.map((m) => <option key={m} value={m}>±{m}%</option>)}
            </select>
          </label>
        </section>

        {plan.events.length === 0 ? (
          <div className="card text-sm text-stone-500">No visits yet. Select indicators with approved content and give their activities a timing.</div>
        ) : (
          <Timeline events={plan.events} selectedKey={selected?.key ?? null} onSelect={setSelectedKey} />
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {selected && <EventDetail key={selected.key} ev={selected} events={plan.events} doc={doc} dispatch={dispatch} onSelect={setSelectedKey} />}
          <div className="space-y-4">
            <Warnings warnings={plan.warnings} events={plan.events} />
            <Changes doc={doc} dispatch={dispatch} dropped={plan.dropped.map((d) => ({ key: d.key, label: `${labelRespondent(d.respondent)} ${labelMode(d.mode)}`, indicators: d.indicator_ids, window: d.window }))} />
          </div>
        </div>
      </fieldset>
    </div>
  )
}

function monthIndex(iso: string): number {
  const [y, m] = iso.split('-').map(Number)
  return y * 12 + (m - 1)
}

function Timeline({ events, selectedKey, onSelect }: { events: PlannedEvent[]; selectedKey: string | null; onSelect: (k: string) => void }) {
  const timed = events.filter((e) => e.window)
  const first = timed.length ? Math.min(...timed.map((e) => monthIndex(e.window!.start))) : 0
  const last = timed.length ? Math.max(...timed.map((e) => monthIndex(e.window!.end))) : 0
  const months = timed.length ? Array.from({ length: Math.min(last - first + 1, 24) }, (_, i) => first + i) : []
  const rows = [...new Set(events.map((e) => `${labelRespondent(e.respondent)} ${labelMode(e.mode)}`))]
  const col = (iso: string) => Math.min(Math.max(monthIndex(iso) - first, 0), months.length - 1) + 2

  return (
    <section className="card overflow-x-auto">
      <div className="grid min-w-[640px] gap-1.5" style={{ gridTemplateColumns: `160px repeat(${Math.max(months.length, 1)}, minmax(70px, 1fr))` }}>
        <div />
        {months.map((m) => (
          <div key={m} className="border-b border-stone-200 px-1 py-1 text-xs text-stone-500">{monthLabel(Math.floor(m / 12), m % 12)}</div>
        ))}
        {(() => {
          // Every visit gets its own grid row; the row label spans the visits of that respondent and method.
          let next = 2
          return rows.map((row, r) => {
            const evs = events.filter((e) => `${labelRespondent(e.respondent)} ${labelMode(e.mode)}` === row)
            const top = next
            next += evs.length
            return [
              <div key={`l${r}`} className="px-1 py-2 text-xs font-semibold" style={{ gridColumn: 1, gridRow: `${top} / span ${evs.length}` }}>{row}</div>,
              ...evs.map((e, i) => (
                <button
                  key={e.key}
                  onClick={() => onSelect(e.key)}
                  aria-pressed={e.key === selectedKey}
                  className={`ev ${e.key === selectedKey ? 'ev-sel' : ''} ${e.status === 'needs_attention' ? 'ev-warn' : ''}`}
                  style={{
                    gridRow: top + i,
                    gridColumn: e.window && months.length ? `${col(e.window.start)} / ${col(e.window.end) + 1}` : `2 / ${Math.max(months.length, 1) + 2}`,
                  }}
                >
                  <b>{e.label}</b>
                  <span>{fmtRange(e.window)} · {plural(e.indicator_ids.length, 'indicator')}{e.sampling.n ? ` · n=${e.sampling.n}` : ''}</span>
                </button>
              )),
            ]
          })
        })()}
      </div>
    </section>
  )
}

function eventName(e: PlannedEvent) {
  return `${e.label} · ${fmtRange(e.window)}`
}

function EventDetail({ ev, events, doc, dispatch, onSelect }: { ev: PlannedEvent; events: PlannedEvent[]; doc: ProjectDoc; dispatch: (a: ProjectAction) => void; onSelect: (k: string | null) => void }) {
  const [action, setAction] = useState<null | 'merge' | 'split' | 'move' | 'drop'>(null)
  const [mergeWith, setMergeWith] = useState('')
  const [splitIds, setSplitIds] = useState<string[]>([])
  const [move, setMove] = useState(ev.window ?? { start: '', end: '' })
  const [note, setNote] = useState('')
  const partners = events.filter((e) => e.key !== ev.key && e.respondent === ev.respondent && e.mode === ev.mode)
  const settings = doc.event_settings[ev.key] ?? {}
  const edit = (e: VisitEdit) => {
    dispatch({ type: 'visit_edit', edit: e })
    setAction(null)
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{ev.label}</h2>
        <span className={`chip ${ev.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{ev.status === 'ready' ? 'ready' : 'needs attention'}</span>
      </div>
      {ev.origin !== 'proposed' && <p className="text-xs text-stone-500">{{ merged: 'Merged by you', split: 'Split by you', moved: 'Moved by you' }[ev.origin]}.</p>}
      <table className="mt-2 w-full text-sm">
        <tbody className="[&_th]:w-28 [&_th]:py-1 [&_th]:pr-2 [&_th]:text-left [&_th]:align-top [&_th]:text-xs [&_th]:font-semibold [&_th]:text-stone-500 [&_td]:py-1">
          <tr><th>Serves</th><td>{ev.indicator_ids.join(', ')}</td></tr>
          <tr>
            <th>Window</th>
            <td>
              {fmtRange(ev.window)}
              <ul className="text-xs text-stone-500">
                {ev.indicator_ids.map((id) => <li key={id}>{id}: its rule asks for {fmtRange(ev.indicator_windows[id])}</li>)}
              </ul>
            </td>
          </tr>
          <tr><th>Method</th><td>{labelMode(ev.mode)} with {labelRespondent(ev.respondent).toLowerCase()} respondents</td></tr>
          <tr>
            <th>Sampling</th>
            <td>
              {ev.sampling.frame
                ? ev.sampling.census
                  ? `All ${ev.sampling.frame} (no sampling needed)`
                  : `${ev.sampling.frame} → n = ${ev.sampling.n} (${ev.sampling.confidence}% / ±${ev.sampling.margin}%${ev.sampling.strata ? `, ${plural(ev.sampling.strata.length, 'stratum', 'strata')}` : ''})`
                : 'No population figure: add it on the Intervention screen.'}
              {ev.sampling.strata && <ul className="text-xs text-stone-500">{ev.sampling.strata.map((s) => <li key={s.name}>{s.name}: {s.population} → {s.n}</li>)}</ul>}
            </td>
          </tr>
          <tr><th>Length</th><td>≈ {ev.estimated_minutes} min ({plural(ev.item_count, 'question')})</td></tr>
          <tr><th>Modules</th><td className="text-xs">{ev.module_ids.join(', ')}</td></tr>
        </tbody>
      </table>
      {ev.notes.map((n) => <p key={n} className="text-xs text-amber-800">{n}</p>)}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-small" disabled={!partners.length} title={partners.length ? '' : 'No other visit with the same respondent and method'} onClick={() => setAction('merge')}>Merge with…</button>
        <button className="btn btn-small" disabled={ev.indicator_ids.length < 2} title={ev.indicator_ids.length < 2 ? 'Only one indicator: nothing to split' : ''} onClick={() => setAction('split')}>Split…</button>
        <button className="btn btn-small" onClick={() => setAction('move')}>Move…</button>
        <button className="btn btn-small" onClick={() => setAction('drop')}>Drop…</button>
      </div>

      {action === 'merge' && (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 text-sm">
          <label className="field">
            <span>Merge into one visit with</span>
            <select className="input" value={mergeWith} onChange={(e) => setMergeWith(e.target.value)}>
              <option value="">Choose a visit…</option>
              {partners.map((p) => <option key={p.key} value={p.key}>{eventName(p)} ({p.indicator_ids.join(', ')})</option>)}
            </select>
          </label>
          <p className="mb-2 text-xs text-stone-500">If the windows do not overlap, the merged visit takes the later window and the app flags the indicator measured outside its own.</p>
          <button className="btn btn-primary btn-small" disabled={!mergeWith} onClick={() => { edit({ op: 'merge', keys: [ev.key, mergeWith] }); onSelect(`${ev.key}+${mergeWith}`) }}>Merge</button>{' '}
          <button className="btn btn-small" onClick={() => setAction(null)}>Cancel</button>
        </div>
      )}
      {action === 'split' && (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 text-sm">
          <p className="mb-1">Move these indicators to a separate visit:</p>
          {ev.indicator_ids.map((id) => (
            <label key={id} className="flex items-center gap-2">
              <input type="checkbox" checked={splitIds.includes(id)} onChange={(e) => setSplitIds(e.target.checked ? [...splitIds, id] : splitIds.filter((x) => x !== id))} /> {id}
            </label>
          ))}
          <button className="btn btn-primary btn-small mt-2" disabled={!splitIds.length || splitIds.length === ev.indicator_ids.length} onClick={() => { edit({ op: 'split', key: ev.key, indicator_ids: splitIds }); onSelect(`${ev.key}#2`) }}>Split</button>{' '}
          <button className="btn btn-small" onClick={() => setAction(null)}>Cancel</button>
        </div>
      )}
      {action === 'move' && (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">From<input type="date" className="input" value={move.start} onChange={(e) => setMove({ ...move, start: e.target.value })} /></label>
            <label className="text-xs text-stone-500">To<input type="date" className="input" value={move.end} onChange={(e) => setMove({ ...move, end: e.target.value })} /></label>
          </div>
          <button className="btn btn-primary btn-small mt-2" disabled={!move.start || !move.end || move.end < move.start} onClick={() => edit({ op: 'move', key: ev.key, window: move })}>Move</button>{' '}
          <button className="btn btn-small" onClick={() => setAction(null)}>Cancel</button>
        </div>
      )}
      {action === 'drop' && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm">
          <p className="mb-1">Dropping this visit leaves {ev.indicator_ids.join(', ')} without data unless another visit serves {ev.indicator_ids.length === 1 ? 'it' : 'them'}.</p>
          <input className="input mb-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional, kept in the project file)" />
          <button className="btn btn-small border-red-300 text-red-800" onClick={() => { edit({ op: 'drop', key: ev.key, note: note.trim() || undefined }); onSelect(null) }}>Drop the visit</button>{' '}
          <button className="btn btn-small" onClick={() => setAction(null)}>Cancel</button>
        </div>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Sampling for this visit</summary>
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="field mb-0">
            <span>Confidence</span>
            <select className="input w-auto" value={settings.confidence ?? ''} onChange={(e) => dispatch({ type: 'set_event_settings', key: ev.key, settings: { ...settings, confidence: e.target.value ? (Number(e.target.value) as Confidence) : undefined } })}>
              <option value="">Project ({doc.sampling.confidence}%)</option>
              {CONFIDENCES.map((c) => <option key={c} value={c}>{c}%</option>)}
            </select>
          </label>
          <label className="field mb-0">
            <span>Margin</span>
            <select className="input w-auto" value={settings.margin ?? ''} onChange={(e) => dispatch({ type: 'set_event_settings', key: ev.key, settings: { ...settings, margin: e.target.value ? Number(e.target.value) : undefined } })}>
              <option value="">Project (±{doc.sampling.margin}%)</option>
              {MARGINS.map((m) => <option key={m} value={m}>±{m}%</option>)}
            </select>
          </label>
        </div>
        <Strata strata={settings.strata ?? []} onChange={(strata) => dispatch({ type: 'set_event_settings', key: ev.key, settings: { ...settings, strata: strata.length ? strata : undefined } })} />
      </details>
    </section>
  )
}

function Strata({ strata, onChange }: { strata: Array<{ name: string; population: number }>; onChange: (s: Array<{ name: string; population: number }>) => void }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-stone-500">Stratify when results must be reported per group (for example camp and host community). Each stratum is sampled with the same confidence and margin.</p>
      {strata.map((s, i) => (
        <div key={i} className="mt-1 flex gap-2">
          <input className="input" value={s.name} placeholder="Group name" onChange={(e) => onChange(strata.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Stratum name" />
          <input type="number" min={0} className="input w-32" value={s.population} onChange={(e) => onChange(strata.map((x, j) => (j === i ? { ...x, population: Math.max(0, Number(e.target.value)) } : x)))} aria-label="Stratum population" />
          <button className="btn btn-small" onClick={() => onChange(strata.filter((_, j) => j !== i))} aria-label="Remove stratum">×</button>
        </div>
      ))}
      <button className="btn btn-small mt-2" onClick={() => onChange([...strata, { name: `Group ${strata.length + 1}`, population: 0 }])}>+ Add stratum</button>
    </div>
  )
}

const WARN_LEVEL: Record<PlanWarning['level'], { label: string; cls: string }> = {
  error: { label: 'Attention', cls: 'bg-red-100 text-red-800' },
  warning: { label: 'To review', cls: 'bg-amber-100 text-amber-800' },
}

function Warnings({ warnings, events }: { warnings: PlanWarning[]; events: PlannedEvent[] }) {
  const sorted = [...warnings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
  return (
    <section className="card">
      <h2 className="mb-2 font-semibold">Warnings</h2>
      {warnings.length === 0 && events.length > 0 && <p className="text-sm text-green-800">Every selected indicator is served by a visit, and every visit has a window and a sample.</p>}
      <ul className="text-sm">
        {sorted.map((w, i) => (
          <li key={i} className="flex gap-2 border-b border-stone-100 py-1 last:border-0">
            <span className={`pill ${WARN_LEVEL[w.level].cls}`}>{WARN_LEVEL[w.level].label}</span>
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function describeEdit(e: VisitEdit): string {
  const k = (key: string) => key.split('+').map((p) => p.replace(/^.*@/, '').replace(/#\d$/, '')).join(' & ')
  switch (e.op) {
    case 'merge':
      return `Merged the visit for ${k(e.keys[0])} with the visit for ${k(e.keys[1])}`
    case 'split':
      return `Split ${e.indicator_ids.join(', ')} into a separate visit`
    case 'move':
      return `Moved the visit for ${k(e.key)} to ${fmtRange(e.window)}`
    case 'drop':
      return `Dropped the visit for ${k(e.key)}${e.note ? ` (${e.note})` : ''}`
  }
}

function Changes({ doc, dispatch, dropped }: { doc: ProjectDoc; dispatch: (a: ProjectAction) => void; dropped: Array<{ key: string; label: string; indicators: string[]; window: { start: string; end: string } | null }> }) {
  if (!doc.visit_edits.length && !Object.keys(doc.event_settings).length) return null
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Your changes</h2>
        <button className="btn btn-small" onClick={() => window.confirm('Go back to the proposed visits? Your merges, splits, moves, drops and per-visit sampling are removed.') && dispatch({ type: 'reset_visits' })}>Reset to the proposed plan</button>
      </div>
      <ol className="list-decimal pl-5 text-sm">
        {doc.visit_edits.map((e, i) => (
          <li key={i} className="py-0.5">
            {describeEdit(e)}{' '}
            <button className="text-xs underline" onClick={() => dispatch({ type: 'remove_visit_edit', index: i })}>Undo</button>
          </li>
        ))}
      </ol>
      {dropped.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">Dropped: {dropped.map((d) => `${d.label} (${d.indicators.join(', ')}, ${fmtRange(d.window)})`).join('; ')}.</p>
      )}
    </section>
  )
}
