import { useMemo, useRef, useState } from 'react'
import type { BankPackage, Indicator } from '@bank/schema/bank'
import type { Bank } from '../bank/loader'
import { matchLogframe, rowsToLines, splitLogframeText } from '@engine/logframe'
import { labelMode, labelRespondent } from '@engine/planner'
import type { BoardEntry } from '@engine/selection'
import type { ProjectAction } from '../project/reducer'
import type { LogframeImport, ProjectDoc } from '../project/schema'
import { boardFor } from '../project/plan'
import { newId, plural } from '../ui/format'

interface Props {
  bank: Bank
  doc: ProjectDoc
  dispatch: (a: ProjectAction) => void
  readOnly: boolean
  onNext: () => void
}

export function IndicatorsView({ bank, doc, dispatch, readOnly, onNext }: Props) {
  const [showAll, setShowAll] = useState(false)
  const board = useMemo(() => boardFor(doc, bank.packages, { showAll }), [doc, bank, showAll])
  const selected = board.filter((e) => e.selected)
  const supported = selected.filter((e) => e.supported)

  return (
    <div>
      <h1 className="text-xl font-bold">Indicators</h1>
      <p className="mb-4 text-stone-500">Mandatory indicators that apply to your activities are ticked and locked. Suggested ones are optional. Grey ones have no approved content in the bank yet.</p>
      <fieldset disabled={readOnly} className="min-w-0">
        <LogframePanel bank={bank} doc={doc} dispatch={dispatch} board={board} startOpen={doc.meta.entry === 'logframe' && !doc.logframe} />

        <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <b>{plural(selected.length, 'indicator')} selected</b>
            {selected.length !== supported.length && <span className="text-stone-500">, {supported.length} with approved content</span>}
            {doc.content_requests.length > 0 && <span className="text-stone-500"> · {plural(doc.content_requests.length, 'content request')}</span>}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every indicator in the bank
          </label>
        </div>

        {board.length === 0 ? (
          <div className="card text-sm text-stone-500">No indicator applies yet. Add activities on the Intervention screen, or import your logframe above.</div>
        ) : (
          bank.packages.map((pkg) => <PackageBoard key={pkg.package_id} pkg={pkg} entries={board.filter((e) => e.package_id === pkg.package_id)} doc={doc} dispatch={dispatch} />)
        )}
      </fieldset>
      {supported.length > 0 && (
        <div className="mt-4 text-right">
          <button className="btn" onClick={onNext}>Plan the visits →</button>
        </div>
      )}
    </div>
  )
}

function PackageBoard({ pkg, entries, doc, dispatch }: { pkg: BankPackage; entries: BoardEntry[]; doc: ProjectDoc; dispatch: (a: ProjectAction) => void }) {
  if (!entries.length) return null
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {pkg.tocs.map((toc) =>
        pkg.results
          .filter((r) => r.toc === toc.id)
          .map((r) => {
            const rows = entries.filter((e) => e.indicator.result === r.id)
            if (!rows.length) return null
            return (
              <section key={r.id} className="card">
                <h2 className="mb-1 text-sm font-semibold">
                  <i className={`cc cc-${pkg.competency.id}`} />
                  {toc.name} · {r.name}
                </h2>
                {rows.map((e) => <IndicatorRow key={e.indicator.id} pkg={pkg} entry={e} doc={doc} dispatch={dispatch} />)}
              </section>
            )
          }),
      )}
    </div>
  )
}

function timingText(ind: Indicator): string {
  if (!ind.timing) return 'timing set by the user'
  const t = ind.timing
  const anchor = t.anchor.replace(/_/g, ' ')
  return `${t.offset.value} ${t.offset.value === 1 ? t.offset.unit.replace(/s$/, '') : t.offset.unit} after ${anchor}${t.parameter_key ? ' (adjustable)' : ''}`
}

function IndicatorRow({ pkg, entry: e, doc, dispatch }: { pkg: BankPackage; entry: BoardEntry; doc: ProjectDoc; dispatch: (a: ProjectAction) => void }) {
  const [removing, setRemoving] = useState(false)
  const [note, setNote] = useState('')
  const ind = e.indicator
  const requested = doc.content_requests.some((r) => r.indicator_id === ind.id && r.status === 'requested')
  const modes = [...new Set(ind.modules.map((m) => pkg.modules.find((x) => x.id === m)).filter(Boolean).map((m) => `${labelRespondent(m!.respondent)} ${labelMode(m!.mode)}`))]
  const needsNote = e.locked || e.bundled_by.length > 0
  const grey = !e.supported || (!e.applies && !e.selected)

  const toggle = (checked: boolean) => {
    if (checked) dispatch({ type: 'set_indicator', choice: { id: ind.id, origin: e.from_logframe ? 'logframe' : 'suggested', state: 'selected' } })
    else if (e.from_logframe) dispatch({ type: 'set_indicator', choice: { id: ind.id, origin: 'logframe', state: 'removed' } })
    else dispatch({ type: 'clear_indicator', id: ind.id })
  }

  return (
    <div className={`flex items-start gap-3 border-b border-stone-100 py-2 last:border-0 ${grey ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        className="mt-1"
        checked={e.selected}
        disabled={needsNote || e.removed}
        onChange={(ev) => toggle(ev.target.checked)}
        aria-label={`Select ${ind.id}`}
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <b>{ind.id}</b>
          <span className={`chip ${ind.status === 'mandatory' ? 'bg-stone-200 text-stone-700' : 'bg-nrc-soft text-nrc-ink'}`}>{ind.status}</span>
          {ind.modality !== 'any' && <span className="chip bg-stone-100 text-stone-600">{ind.modality}</span>}
          {e.from_logframe && <span className="chip bg-blue-100 text-blue-800">from logframe</span>}
          {!e.supported && <span className="chip bg-red-100 text-red-800">no content yet</span>}
          {e.removed && <span className="chip bg-amber-100 text-amber-800">removed</span>}
        </div>
        <div>{ind.title_template.replace(/\{[^}]+\}/g, '…')}</div>
        <div className="text-xs text-stone-500">
          {e.reason} {e.supported && <>· {modes.join(', ') || 'no module'} · {timingText(ind)}</>}
        </div>
        {e.removed && e.removal_note && <div className="text-xs text-amber-800">Removed: {e.removal_note}</div>}

        <div className="mt-1 flex flex-wrap gap-2">
          {e.removed && (
            <button className="btn btn-small" onClick={() => dispatch({ type: 'clear_indicator', id: ind.id })}>Restore</button>
          )}
          {needsNote && !removing && (
            <button className="btn btn-small" onClick={() => setRemoving(true)}>Not applicable?</button>
          )}
          {!e.supported && (e.applies || e.selected) &&
            (requested ? (
              <span className="text-xs text-green-800">
                Content requested.{' '}
                <button className="underline" onClick={() => dispatch({ type: 'withdraw_request', indicator_id: ind.id })}>Withdraw</button>
              </span>
            ) : (
              <button className="btn btn-small" onClick={() => dispatch({ type: 'request_content', indicator_id: ind.id })}>Request content</button>
            ))}
        </div>
        {removing && (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (!note.trim()) return
              dispatch({ type: 'set_indicator', choice: { id: ind.id, origin: e.locked ? 'mandatory' : e.origin, state: 'removed', removal_note: note.trim() } })
              setRemoving(false)
              setNote('')
            }}
          >
            <input className="input flex-1" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Why it does not apply (kept in the project file)" autoFocus />
            <button className="btn btn-small" type="submit" disabled={!note.trim()}>Remove with this note</button>
            <button className="btn btn-small" type="button" onClick={() => setRemoving(false)}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  )
}

const STATUS: Record<string, { label: string; cls: string }> = {
  matched: { label: 'matched', cls: 'bg-green-100 text-green-800' },
  unsupported: { label: 'in bank, no content yet', cls: 'bg-amber-100 text-amber-800' },
  unmatched: { label: 'not found', cls: 'bg-stone-200 text-stone-700' },
  out_of_scope: { label: 'output, not in scope', cls: 'bg-stone-200 text-stone-700' },
  duplicate: { label: 'duplicate', cls: 'bg-stone-200 text-stone-700' },
}

function LogframePanel({ bank, doc, dispatch, board, startOpen }: { bank: Bank; doc: ProjectDoc; dispatch: (a: ProjectAction) => void; board: BoardEntry[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen || !!doc.logframe)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = (lines: string[], source: LogframeImport['source'], file_name?: string) => {
    if (!lines.length) return setError('Nothing to match: the text or sheet is empty.')
    setError(null)
    dispatch({ type: 'import_logframe', logframe: { imported_on: new Date().toISOString(), source, file_name, lines: matchLogframe(lines, bank.packages) } })
  }

  const upload = async (f: File | undefined) => {
    if (!f) return
    try {
      // The spreadsheet reader is a separate file of this app, loaded only when someone uploads a sheet.
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer())
      const rows = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '' }))
      run(rowsToLines(rows), 'file', f.name)
    } catch {
      setError('This file could not be read as a spreadsheet. Save it as .xlsx or paste the indicator lines instead.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const lf = doc.logframe
  const counts = lf ? Object.fromEntries(Object.keys(STATUS).map((k) => [k, lf.lines.filter((l) => l.status === k).length])) : {}
  const shown = lf ? lf.lines.filter((l) => l.status !== 'unmatched' || lf.lines.length <= 40) : []

  // Activities the imported indicators need but the canvas does not have yet.
  const missing = useMemo(() => {
    const out: Array<{ pkg: BankPackage; activity_id: string; label: string; modality?: 'in-kind' | 'CVA'; for: string[] }> = []
    for (const e of board) {
      if (!e.from_logframe || e.applies || !e.supported) continue
      const pkg = bank.packages.find((p) => p.package_id === e.package_id)!
      const defs = e.indicator.applicability.length ? pkg.activities.filter((a) => e.indicator.applicability.includes(a.id)) : pkg.activities.filter((a) => a.results.includes(e.indicator.result))
      for (const d of defs) {
        const modality = e.indicator.modality === 'any' ? undefined : e.indicator.modality
        const hit = out.find((o) => o.activity_id === d.id)
        if (hit) {
          hit.for.push(e.indicator.id)
          if (modality && hit.modality !== modality) hit.modality = undefined
        } else out.push({ pkg, activity_id: d.id, label: d.label, modality, for: [e.indicator.id] })
      }
    }
    return out.filter((o) => !doc.activities.some((a) => a.activity_id === o.activity_id))
  }, [board, bank, doc.activities])

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Logframe import</h2>
        <button className="btn btn-small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Hide' : lf ? 'Show the import' : 'Import indicators from your logframe'}</button>
      </div>
      {open && (
        <div className="mt-2">
          {!lf ? (
            <>
              <p className="mb-2 text-sm text-stone-500">Paste the indicator lines (IDs, titles or rows copied from Excel), or upload the spreadsheet. Matching uses the indicator ID, the GORS UID, or the title.</p>
              <textarea className="input font-mono text-xs" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'GL-SB403/FL\n% of participant households who report / are observed using essential household items as intended…'} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className="btn btn-primary btn-small" disabled={!text.trim()} onClick={() => run(splitLogframeText(text), 'paste')}>Match pasted lines</button>
                <label className="btn btn-small cursor-pointer">
                  Upload Excel (.xlsx)
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
                </label>
                <span className="text-xs text-stone-500">The file is read in your browser and not uploaded anywhere.</span>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm">
                {lf.source === 'file' ? `From ${lf.file_name}` : 'Pasted'}: {plural(lf.lines.length, 'line')}. Matched {counts.matched ?? 0}
                {counts.unsupported ? `, in the bank without content ${counts.unsupported}` : ''}, not found {counts.unmatched ?? 0}
                {counts.out_of_scope ? `, outputs ${counts.out_of_scope}` : ''}
                {counts.duplicate ? `, duplicates ${counts.duplicate}` : ''}.
              </p>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-stone-500"><th className="py-1 pr-2">Line</th><th className="py-1 pr-2">Text</th><th className="py-1">Match</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((l) => (
                      <tr key={l.line} className="border-t border-stone-100 align-top">
                        <td className="py-1 pr-2 text-stone-500">{l.line}</td>
                        <td className="max-w-md truncate py-1 pr-2" title={l.text}>{l.text}</td>
                        <td className="py-1">
                          <span className={`chip ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>{' '}
                          {l.indicator_id && <b className="text-xs">{l.indicator_id}</b>}{' '}
                          {l.by === 'title' && <span className="text-xs text-stone-500">by title ({Math.round((l.score ?? 0) * 100)}%)</span>}
                          {l.by === 'gors_uid' && <span className="text-xs text-stone-500">by GORS UID</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length < lf.lines.length && <p className="mt-1 text-xs text-stone-500">{lf.lines.length - shown.length} lines with no match are not listed.</p>}
              </div>
              {missing.length > 0 && (
                <div className="hint mt-3">
                  <b>Your logframe needs these activities on the canvas:</b>
                  <ul className="mt-1 space-y-1">
                    {missing.map((m) => (
                      <li key={m.activity_id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {m.label} <span className="text-xs">(for {m.for.join(', ')})</span>
                        </span>
                        <button
                          className="btn btn-small"
                          onClick={() =>
                            dispatch({
                              type: 'add_activity',
                              activity: { id: newId(), activity_id: m.activity_id, package_id: m.pkg.package_id, raw_timing: '', timing: null, modalities: m.modality ? [m.modality] : (['in-kind', 'CVA'] as const).filter((x) => m.pkg.activities.find((a) => a.id === m.activity_id)?.modalities.includes(x)), populations: {}, location: '', notes: '' },
                            })
                          }
                        >
                          Add to the canvas
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">Then give each one its timing and the number of people reached on the Intervention screen.</p>
                </div>
              )}
              <button className="btn btn-small mt-2" onClick={() => dispatch({ type: 'clear_logframe' })}>Clear the import</button>
            </>
          )}
          {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
        </div>
      )}
    </section>
  )
}
