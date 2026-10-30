import { useMemo, useState } from 'react'
import type { Activity, BankPackage } from '@bank/schema/bank'
import type { Bank } from '../bank/loader'
import { suggestActivities } from '@engine/activityMatch'
import { coverage } from '@engine/selection'
import { labelRespondent } from '@engine/planner'
import { describeTiming, parseTiming } from '@engine/timing'
import type { ProjectAction } from '../project/reducer'
import type { ProjectActivity, ProjectDoc } from '../project/schema'
import { boardFor } from '../project/plan'
import { fmtRange, newId, plural } from '../ui/format'
import { LanguagePicker } from './HomeView'

interface Props {
  bank: Bank
  doc: ProjectDoc
  dispatch: (a: ProjectAction) => void
  readOnly: boolean
  onNext: () => void
}

export function CanvasView({ bank, doc, dispatch, readOnly, onNext }: Props) {
  const [picking, setPicking] = useState(doc.activities.length === 0)
  const board = useMemo(() => boardFor(doc, bank.packages), [doc, bank])
  const cov = coverage(board)

  const add = (pkg: BankPackage, def: Activity, freeText?: string) => {
    const modalities = def.modalities.filter((m): m is 'in-kind' | 'CVA' => m === 'in-kind' || m === 'CVA')
    dispatch({
      type: 'add_activity',
      activity: {
        id: newId(),
        activity_id: def.id,
        package_id: pkg.package_id,
        raw_timing: '',
        timing: null,
        modalities: modalities.length ? [modalities[0]] : [],
        populations: {},
        location: '',
        notes: '',
        free_text: freeText,
      },
    })
    setPicking(false)
  }

  return (
    <div>
      <h1 className="text-xl font-bold">Intervention</h1>
      <p className="mb-4 text-stone-500">Add the activities. Each card asks only what that activity needs. Type the timing as you would say it; the app shows what it understood.</p>
      <fieldset disabled={readOnly} className="min-w-0">
        <ProjectDetails bank={bank} doc={doc} dispatch={dispatch} readOnly={readOnly} />

        <div className="mb-3 mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>{picking ? 'Close the activity list' : '+ Add activity'}</button>
          {bank.packages.map((p) => (
            <span key={p.package_id} className="chip bg-nrc-soft text-nrc-ink"><i className={`cc cc-${p.competency.id}`} />{p.competency.name}</span>
          ))}
        </div>
        {picking && <ActivityPicker packages={bank.packages} onAdd={add} />}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {doc.activities.map((a) => (
            <ActivityCard key={a.id} packages={bank.packages} activity={a} dispatch={dispatch} />
          ))}
        </div>
      </fieldset>

      {doc.activities.length > 0 && (
        <div className="hint mt-4 flex flex-wrap items-center justify-between gap-2">
          <span>
            Coverage: {plural(doc.activities.length, 'activity', 'activities')} → {plural(cov.tocs, 'theory of change', 'theories of change')} → {cov.mandatory} mandatory and {cov.suggested} suggested{' '}
            {cov.suggested === 1 ? 'indicator' : 'indicators'}.{cov.not_supported > 0 && ` ${cov.not_supported} of them have no approved content in the bank yet.`}
          </span>
          <button className="btn btn-small" onClick={onNext}>Review the indicators →</button>
        </div>
      )}
    </div>
  )
}

function ProjectDetails({ bank, doc, dispatch, readOnly }: { bank: Bank; doc: ProjectDoc; dispatch: (a: ProjectAction) => void; readOnly: boolean }) {
  const countries = bank.countries?.countries ?? []
  const c = countries.find((x) => x.name === doc.meta.country)
  return (
    <section className="card">
      <h2 className="mb-2 font-semibold">Project</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="field">
          <span>Name</span>
          <input className="input" value={doc.meta.name} onChange={(e) => dispatch({ type: 'set_meta', patch: { name: e.target.value } })} />
        </label>
        <label className="field">
          <span>Country</span>
          <select className="input" value={doc.meta.country} onChange={(e) => dispatch({ type: 'set_meta', patch: { country: e.target.value, area: '' } })}>
            <option value="">Not set</option>
            {countries.map((x) => <option key={x.name}>{x.name}</option>)}
            {doc.meta.country && !c && <option>{doc.meta.country}</option>}
          </select>
        </label>
        <label className="field">
          <span>Area</span>
          {c && c.regions.length ? (
            <select className="input" value={doc.meta.area} onChange={(e) => dispatch({ type: 'set_meta', patch: { area: e.target.value } })}>
              <option value="">Whole country or several areas</option>
              {c.regions.map((r) => <option key={r}>{r}</option>)}
              {doc.meta.area && !c.regions.includes(doc.meta.area) && <option>{doc.meta.area}</option>}
            </select>
          ) : (
            <input className="input" value={doc.meta.area} onChange={(e) => dispatch({ type: 'set_meta', patch: { area: e.target.value } })} />
          )}
        </label>
      </div>
      <LanguagePicker bank={bank} value={doc.meta.languages} suggested={c?.languages ?? []} disabled={readOnly} onChange={(languages) => dispatch({ type: 'set_meta', patch: { languages } })} />
    </section>
  )
}

function ActivityPicker({ packages, onAdd }: { packages: BankPackage[]; onAdd: (pkg: BankPackage, def: Activity, freeText?: string) => void }) {
  const [text, setText] = useState('')
  const suggestions = useMemo(() => suggestActivities(text, packages), [text, packages])
  return (
    <section className="card mb-4">
      <label className="field">
        <span>Describe the activity in your own words (optional)</span>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "we gave out tarpaulins and rope"' />
      </label>
      {text.trim() && (
        <div className="mb-3">
          {suggestions.length === 0 ? (
            <p className="text-sm text-stone-500">No standard activity matches these words. Pick one from the list below, or ask an adviser to add the wording to the bank.</p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => {
                const pkg = packages.find((p) => p.package_id === s.package_id)!
                return (
                  <li key={s.activity.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-nrc-soft px-3 py-2 text-sm">
                    <span>
                      <b>{s.activity.label}</b> <span className="text-xs text-stone-600">matched “{s.matched}”</span>
                    </span>
                    <button className="btn btn-small" onClick={() => onAdd(pkg, s.activity, text.trim())}>Add this activity</button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {packages.map((pkg) => {
        const tocs = pkg.tocs
        return (
          <div key={pkg.package_id}>
            <h3 className="text-sm font-semibold"><i className={`cc cc-${pkg.competency.id}`} />{pkg.competency.name}</h3>
            {tocs.map((toc) => {
              const acts = pkg.activities.filter((a) => a.toc === toc.id)
              const areas = [...new Set(acts.map((a) => a.area_of_work ?? ''))]
              return (
                <div key={toc.id} className="mb-2 ml-4">
                  <div className="text-xs uppercase tracking-wide text-stone-500">{toc.name}</div>
                  {areas.map((area) => (
                    <div key={area} className="ml-2">
                      {area && <div className="mt-1 text-xs text-stone-500">{area}</div>}
                      {acts
                        .filter((a) => (a.area_of_work ?? '') === area)
                        .map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2 border-b border-stone-100 py-1 text-sm">
                            <span>{a.label}</span>
                            <button className="btn btn-small" aria-label={`Add ${a.label}`} onClick={() => onAdd(pkg, a)}>Add</button>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}

const UNIT_LABEL: Record<string, string> = { household: 'households', individual: 'people', facility: 'facilities', site: 'sites', session: 'sessions' }

function ActivityCard({ packages, activity: a, dispatch }: { packages: BankPackage[]; activity: ProjectActivity; dispatch: (x: ProjectAction) => void }) {
  const pkg = packages.find((p) => p.package_id === a.package_id)
  const def = pkg?.activities.find((x) => x.id === a.activity_id)
  const update = (patch: Partial<Omit<ProjectActivity, 'id'>>) => dispatch({ type: 'update_activity', id: a.id, patch })
  if (!pkg || !def) {
    return (
      <div className="act">
        <b>{a.activity_id}</b>
        <p className="text-sm text-red-800">This activity is not in the current bank release.</p>
        <button className="btn btn-small" onClick={() => dispatch({ type: 'remove_activity', id: a.id })}>Remove</button>
      </div>
    )
  }
  const asks = new Set(def.asks)
  const parsed = a.raw_timing.trim() ? parseTiming(a.raw_timing) : null
  const modalityChoices = def.modalities.filter((m): m is 'in-kind' | 'CVA' => m === 'in-kind' || m === 'CVA')

  const setTimingText = (raw: string) => {
    const t = raw.trim() ? parseTiming(raw) : null
    if (t && t.kind !== 'unresolved') update({ raw_timing: raw, timing: { start: t.start, end: t.end }, timing_source: 'parsed' })
    else update({ raw_timing: raw, ...(a.timing_source === 'picked' ? {} : { timing: null, timing_source: undefined }) })
  }
  const setDate = (which: 'start' | 'end', v: string) => {
    if (!v) return
    const cur = a.timing ?? { start: v, end: v }
    const next = { ...cur, [which]: v }
    if (next.end < next.start) next[which === 'start' ? 'end' : 'start'] = v
    update({ timing: next, timing_source: 'picked' })
  }

  return (
    <div className={`act act-${pkg.competency.id}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold"><i className={`cc cc-${pkg.competency.id}`} />{def.label}</h3>
        <button className="text-xs text-stone-500 hover:text-red-700" onClick={() => dispatch({ type: 'remove_activity', id: a.id })} aria-label={`Remove ${def.label}`}>Remove</button>
      </div>
      {a.free_text && <p className="mb-2 text-xs text-stone-500">From your words: “{a.free_text}”</p>}

      {asks.has('modality') && modalityChoices.length > 0 && (
        <div className="field">
          <span>Modality</span>
          <div className="flex gap-4 text-sm">
            {modalityChoices.map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="checkbox" checked={a.modalities.includes(m)} onChange={(e) => update({ modalities: e.target.checked ? [...a.modalities, m] : a.modalities.filter((x) => x !== m) })} />
                {m === 'CVA' ? 'Cash or voucher (CVA)' : 'In-kind'}
              </label>
            ))}
          </div>
          {a.modalities.length === 0 && <p className="mt-1 text-xs text-amber-800">Pick at least one modality: the mandatory indicators differ for in-kind and CVA.</p>}
        </div>
      )}

      {asks.has('timing') && (
        <div className="field">
          <span>When ({def.anchors.join(', ').replace(/_/g, ' ')})</span>
          <input className="input" value={a.raw_timing} onChange={(e) => setTimingText(e.target.value)} placeholder="e.g. 1–20 Sep 2026, mid-October, Q1 2027" />
          {parsed && (
            <p className={`mt-1 text-xs ${parsed.kind === 'unresolved' ? 'text-amber-800' : 'text-green-800'}`}>
              {parsed.kind === 'unresolved' ? 'Not understood. Pick the dates below; your text is kept for display.' : `We understood: ${describeTiming(parsed)}.`}
              {parsed.kind !== 'unresolved' &&
                parsed.confidence === 'medium' &&
                (/\b\d{4}\b/.test(a.raw_timing) ? ' These dates are approximate; adjust them below if needed.' : ' The year was assumed; check it.')}
            </p>
          )}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">From<input type="date" className="input" value={a.timing?.start ?? ''} onChange={(e) => setDate('start', e.target.value)} /></label>
            <label className="text-xs text-stone-500">To<input type="date" className="input" value={a.timing?.end ?? ''} onChange={(e) => setDate('end', e.target.value)} /></label>
          </div>
          {a.timing && a.timing_source === 'picked' && <p className="mt-1 text-xs text-stone-500">Dates set on the calendar: {fmtRange(a.timing)}.</p>}
        </div>
      )}

      {asks.has('rounds') && (
        <label className="field">
          <span>Distribution rounds</span>
          <input type="number" min={1} className="input" value={a.rounds ?? ''} onChange={(e) => update({ rounds: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} />
        </label>
      )}

      {asks.has('population') && (
        <div className="field">
          <span>Reached ({UNIT_LABEL[def.unit] ?? def.unit})</span>
          <div className="grid grid-cols-2 gap-2">
            {(def.respondents.length ? def.respondents : [def.unit]).map((r) => (
              <label key={r} className="text-xs text-stone-500">
                {labelRespondent(r)}
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={a.populations[r] ?? ''}
                  onChange={(e) => {
                    const populations = { ...a.populations }
                    if (e.target.value === '') delete populations[r]
                    else populations[r] = Math.max(0, Number(e.target.value))
                    update({ populations })
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {asks.has('units') && (
        <label className="field">
          <span>Units handed over (shelters, structures)</span>
          <input type="number" min={0} className="input" value={a.units ?? ''} onChange={(e) => update({ units: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
        </label>
      )}

      {asks.has('location') && (
        <label className="field">
          <span>Where</span>
          <input className="input" value={a.location} onChange={(e) => update({ location: e.target.value })} placeholder="Sites, camps, districts" />
        </label>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea className="input" rows={2} value={a.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>
    </div>
  )
}
