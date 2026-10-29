import { useMemo, useRef, useState } from 'react'
import type { Bank } from '../bank/loader'
import type { ProjectSummary } from '../project/store'
import { loadProject } from '../project/store'
import { downloadText, projectFileName, serializeProject } from '../project/file'
import { plural, relativeTime } from '../ui/format'

type Entry = 'intervention' | 'logframe'

interface Props {
  bank: Bank
  projects: ProjectSummary[]
  storageError: string | null
  onCreate: (init: { name: string; country: string; area: string; languages: string[]; entry: Entry }) => void
  onOpen: (id: string) => Promise<string | null>
  onImport: (text: string) => string | null
  onDelete: (id: string) => Promise<void>
}

export function HomeView({ bank, projects, storageError, onCreate, onOpen, onImport, onDelete }: Props) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const importFile = async (f: File | undefined) => {
    if (!f) return
    const err = onImport(await f.text())
    setMessage(err ?? null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const exportProject = async (id: string) => {
    const r = await loadProject(id)
    if (r.ok) downloadText(projectFileName(r.doc), serializeProject(r.doc))
    else setMessage(r.error)
  }

  return (
    <div>
      <h1 className="text-xl font-bold">Start a monitoring plan</h1>
      <p className="mb-4 text-stone-500">Two ways in. Both lead to the same plan: what you did, what you must measure, who you ask and when.</p>

      {entry ? (
        <NewProjectForm bank={bank} entry={entry} onCancel={() => setEntry(null)} onCreate={(init) => onCreate({ ...init, entry })} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button className="door" onClick={() => setEntry('intervention')}>
            <h2 className="mb-1 text-lg font-semibold">Describe your intervention</h2>
            <p className="text-stone-500">Add your activities. The app finds the indicators that apply, then plans the visits.</p>
          </button>
          <button className="door" onClick={() => setEntry('logframe')}>
            <h2 className="mb-1 text-lg font-semibold">Start from your logframe</h2>
            <p className="text-stone-500">Paste or upload the indicator list from the proposal or GORS. The app matches it to the bank and asks only for what is missing.</p>
          </button>
        </div>
      )}

      {message && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{message}</div>}
      {storageError && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Projects cannot be saved in this browser ({storageError}). You can still work; export the project file before closing the page.
        </div>
      )}

      <section className="card mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recent projects</h2>
          <label className="btn cursor-pointer">
            Import project file
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-stone-500">No projects on this device yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-1 pr-3">Project</th><th className="py-1 pr-3">Country</th><th className="py-1 pr-3">Indicators</th><th className="py-1 pr-3">Visits</th><th className="py-1 pr-3">Saved</th><th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="py-1.5 pr-3">
                      <button className="font-semibold text-nrc-ink hover:underline" onClick={() => void onOpen(p.id).then((e) => setMessage(e))}>{p.name}</button>
                    </td>
                    <td className="py-1.5 pr-3">{p.country || '—'}</td>
                    <td className="py-1.5 pr-3">{p.indicators}</td>
                    <td className="py-1.5 pr-3">{p.events}</td>
                    <td className="py-1.5 pr-3 text-stone-500">{relativeTime(p.updated)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right">
                      <button className="btn btn-small" onClick={() => void exportProject(p.id)}>Export</button>{' '}
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          if (window.confirm(`Delete "${p.name}" from this device? Export it first if you may need it again.`)) void onDelete(p.id)
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-500">
          Projects are saved in this browser on this device only, and leave it only as files you export. They hold programme settings, never data about people.
        </p>
      </section>
    </div>
  )
}

function NewProjectForm({ bank, entry, onCancel, onCreate }: { bank: Bank; entry: Entry; onCancel: () => void; onCreate: (init: { name: string; country: string; area: string; languages: string[] }) => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [area, setArea] = useState('')
  const [languages, setLanguages] = useState<string[]>(['en'])
  const countries = bank.countries?.countries ?? []
  const c = countries.find((x) => x.name === country)

  const pickCountry = (n: string) => {
    setCountry(n)
    setArea('')
    const suggested = countries.find((x) => x.name === n)?.languages ?? []
    setLanguages(['en', ...suggested])
  }

  return (
    <form
      className="card max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onCreate({ name: name.trim(), country, area, languages })
      }}
    >
      <h2 className="mb-1 font-semibold">{entry === 'intervention' ? 'Describe your intervention' : 'Start from your logframe'}: new project</h2>
      <p className="mb-3 text-sm text-stone-500">Country and area set the suggested languages. Everything can be changed later.</p>
      <label className="field">
        <span>Project name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maiduguri emergency shelter 2026" required autoFocus />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Country</span>
          <select className="input" value={country} onChange={(e) => pickCountry(e.target.value)}>
            <option value="">Choose…</option>
            {countries.map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Area</span>
          {c && c.regions.length ? (
            <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Whole country or several areas</option>
              {c.regions.map((r) => <option key={r}>{r}</option>)}
            </select>
          ) : (
            <input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Region, state or district" />
          )}
        </label>
      </div>
      <LanguagePicker bank={bank} value={languages} onChange={setLanguages} suggested={c?.languages ?? []} />
      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create project</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export function LanguagePicker({ bank, value, onChange, suggested, disabled }: { bank: Bank; value: string[]; onChange: (v: string[]) => void; suggested: string[]; disabled?: boolean }) {
  const all = useMemo(() => bank.countries?.languages ?? [{ code: 'en', name: 'English', rtl: false }], [bank])
  const name = (code: string) => all.find((l) => l.code === code)?.name ?? code
  const others = all.filter((l) => !value.includes(l.code))
  return (
    <div className="field">
      <span>Languages of the instruments</span>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((code) => (
          <span key={code} className="chip bg-stone-200 text-stone-800">
            {name(code)} ({code}){code === 'en' ? ' · always' : ''}
            {code !== 'en' && !disabled && (
              <button type="button" className="ml-1 text-stone-500 hover:text-stone-900" aria-label={`Remove ${name(code)}`} onClick={() => onChange(value.filter((x) => x !== code))}>×</button>
            )}
          </span>
        ))}
        {!disabled && others.length > 0 && (
          <select className="input w-auto" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} aria-label="Add a language">
            <option value="">+ Add language</option>
            {others.map((l) => (
              <option key={l.code} value={l.code}>{l.name}{suggested.includes(l.code) ? ' (suggested)' : ''}</option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">English is always included. {plural(value.length - 1, 'other language')} selected.</p>
    </div>
  )
}
