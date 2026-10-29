import { useMemo, useState, type ReactNode } from 'react'
import { loadBank } from './bank/loader'
import { useProject, type SaveState } from './state/useProject'
import { boardFor, planFor } from './project/plan'
import { downloadText, projectFileName, serializeProject } from './project/file'
import { lastScreen, rememberScreen } from './project/store'
import type { ProjectDoc } from './project/schema'
import { relativeTime } from './ui/format'
import { BankView } from './views/BankView'
import { HomeView } from './views/HomeView'
import { CanvasView } from './views/CanvasView'
import { IndicatorsView } from './views/IndicatorsView'
import { VisitsView } from './views/VisitsView'

type Screen = 'home' | 'canvas' | 'indicators' | 'visits' | 'params' | 'instruments' | 'package' | 'bank'
type Progress = 'done' | 'part' | 'none'

interface NavItem {
  id: Screen
  label: string
  section: 'Plan' | 'Build' | 'Adviser' | null
  needsProject?: boolean
  phase?: string
}

const NAV: NavItem[] = [
  { id: 'home', label: 'Home', section: null },
  { id: 'canvas', label: 'Intervention', section: 'Plan', needsProject: true },
  { id: 'indicators', label: 'Indicators', section: 'Plan', needsProject: true },
  { id: 'visits', label: 'Visits', section: 'Plan', needsProject: true },
  { id: 'params', label: 'Parameters & context', section: 'Build', needsProject: true, phase: 'phase 2' },
  { id: 'instruments', label: 'Instruments', section: 'Build', needsProject: true, phase: 'phase 3' },
  { id: 'package', label: 'Package', section: 'Build', needsProject: true, phase: 'phase 2' },
  { id: 'bank', label: 'Bank', section: 'Adviser' },
]

export default function App() {
  const bank = useMemo(() => loadBank(), [])
  const project = useProject(bank)
  const [screen, setScreen] = useState<Screen>(() => {
    const s = lastScreen()
    return NAV.some((n) => n.id === s && !n.phase) ? (s as Screen) : 'home'
  })
  const { doc } = project
  const indicatorCount = bank.packages.reduce((n, p) => n + p.indicators.length, 0)
  const readOnly = doc?.meta.mode === 'reviewer'

  const progress = useMemo(() => (doc ? planProgress(doc, bank) : null), [doc, bank])
  const current: Screen = !doc && NAV.find((n) => n.id === screen)?.needsProject ? 'home' : screen

  const go = (s: Screen) => {
    setScreen(s)
    rememberScreen(s)
    window.scrollTo(0, 0)
  }

  let body: ReactNode
  if (!project.ready) body = <p className="text-stone-500">Opening…</p>
  else if (current === 'bank') body = <BankView bank={bank} />
  else if (!doc || current === 'home')
    body = (
      <HomeView
        bank={bank}
        projects={project.projects}
        storageError={project.storageError}
        onCreate={(init) => {
          project.create(init)
          go(init.entry === 'logframe' ? 'indicators' : 'canvas')
        }}
        onOpen={async (id) => {
          const err = await project.open(id)
          if (!err) go('canvas')
          return err
        }}
        onImport={(text) => {
          const err = project.importText(text)
          if (!err) go('canvas')
          return err
        }}
        onDelete={project.remove}
      />
    )
  else if (current === 'canvas') body = <CanvasView bank={bank} doc={doc} dispatch={project.dispatch} readOnly={readOnly} onNext={() => go('indicators')} />
  else if (current === 'indicators') body = <IndicatorsView bank={bank} doc={doc} dispatch={project.dispatch} readOnly={readOnly} onNext={() => go('visits')} />
  else if (current === 'visits') body = <VisitsView bank={bank} doc={doc} dispatch={project.dispatch} readOnly={readOnly} />
  else body = <ComingLater item={NAV.find((n) => n.id === current)!} />

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[230px_1fr]">
      <aside className="border-b border-stone-200 bg-white p-3 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-nrc font-extrabold text-white">N</div>
          <div>
            <div className="text-sm font-bold">Monitoring Plan Builder</div>
            <div className="text-[11px] text-stone-500">
              Bank v{bank.release.version} · {bank.packages.length} package{bank.packages.length === 1 ? '' : 's'} · {indicatorCount} indicators
            </div>
          </div>
        </div>
        <nav aria-label="Screens">
          {(['', 'Plan', 'Build', 'Adviser'] as const).map((section) => (
            <div key={section}>
              {section && <div className="mt-3 px-2 text-[11px] uppercase tracking-wide text-stone-500">{section}</div>}
              {NAV.filter((n) => (n.section ?? '') === section).map((n) => {
                const disabled = (n.needsProject && !doc) || !!n.phase
                const dot = progress && n.needsProject && !n.phase ? progress[n.id as 'canvas' | 'indicators' | 'visits'] : null
                return (
                  <button
                    key={n.id}
                    onClick={() => !disabled && go(n.id)}
                    disabled={disabled && !n.phase}
                    aria-current={current === n.id ? 'page' : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${current === n.id ? 'bg-nrc-soft font-semibold text-nrc-ink' : 'hover:bg-stone-100'} ${disabled ? 'cursor-default text-stone-400 hover:bg-transparent' : ''}`}
                    title={n.phase ? `Arrives in ${n.phase}` : disabled ? 'Open or start a project first' : undefined}
                  >
                    {dot && <span className={`dot dot-${dot}`} aria-label={dot === 'done' ? 'complete' : dot === 'part' ? 'in progress' : 'not started'} />}
                    <span className="flex-1">{n.label}</span>
                    {n.phase && <span className="text-[10px]">{n.phase}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <p className="mt-6 px-2 text-[11px] text-stone-500">No AI, no server: everything runs in this browser and projects stay on this device.</p>
      </aside>
      <main className="min-w-0 px-4 pb-12 md:px-7">
        {doc && <TopBar doc={doc} save={project.save} onMode={(mode) => project.dispatch({ type: 'set_meta', patch: { mode } })} onClose={() => { project.close(); go('home') }} bank={bank} />}
        {bank.problems.length > 0 && (
          <div className="my-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <b>Bank problems:</b>
            <ul className="list-disc pl-5">{bank.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <div className="pt-5">{body}</div>
      </main>
    </div>
  )
}

function planProgress(doc: ProjectDoc, bank: ReturnType<typeof loadBank>): Record<'canvas' | 'indicators' | 'visits', Progress> {
  const acts = doc.activities
  const canvas: Progress = acts.length === 0 ? 'none' : acts.every((a) => a.timing && Object.keys(a.populations).length) ? 'done' : 'part'
  const board = boardFor(doc, bank.packages)
  const sel = board.filter((e) => e.selected && e.supported)
  const indicators: Progress = sel.length ? 'done' : board.some((e) => e.selected) ? 'part' : 'none'
  const plan = planFor(doc, bank.packages, board)
  const visits: Progress = plan.events.length === 0 ? 'none' : plan.warnings.some((w) => w.level === 'error') || plan.events.some((e) => e.status !== 'ready') ? 'part' : 'done'
  return { canvas, indicators, visits }
}

function TopBar({ doc, save, onMode, onClose, bank }: { doc: ProjectDoc; save: SaveState; onMode: (m: ProjectDoc['meta']['mode']) => void; onClose: () => void; bank: ReturnType<typeof loadBank> }) {
  const langName = (c: string) => bank.countries?.languages.find((l) => l.code === c)?.name ?? c
  const saved = save.state === 'saved' ? `saved ${relativeTime(save.at)}` : save.state === 'saving' ? 'saving…' : save.state === 'error' ? 'not saved' : ''
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3">
      <div className="min-w-0">
        <div className="truncate text-base font-bold">{doc.meta.name}</div>
        <div className="text-xs text-stone-500">
          {[doc.meta.country, doc.meta.area].filter(Boolean).join(' · ') || 'Country not set'} · {doc.meta.languages.map(langName).join(', ')} · project v{doc.meta.version} ·{' '}
          <span className={save.state === 'error' ? 'font-semibold text-red-800' : ''} title={save.state === 'error' ? save.message : undefined}>{saved}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-full border border-stone-300 text-sm" role="group" aria-label="Mode">
          {(['builder', 'reviewer', 'adviser'] as const).map((m) => (
            <button key={m} onClick={() => onMode(m)} aria-pressed={doc.meta.mode === m} className={`px-3 py-1 capitalize ${doc.meta.mode === m ? 'bg-stone-800 text-white' : 'bg-white hover:bg-stone-50'}`}>{m}</button>
          ))}
        </div>
        <button className="btn btn-small" onClick={() => downloadText(projectFileName(doc), serializeProject(doc))}>Export project</button>
        <button className="btn btn-small" onClick={onClose}>Close</button>
      </div>
      {doc.meta.mode === 'reviewer' && <p className="w-full text-xs text-stone-500">Reviewer mode: the plan is read-only. Review tools for instruments and translations arrive in phase 3.</p>}
      {doc.meta.mode === 'adviser' && <p className="w-full text-xs text-stone-500">Adviser mode: the Bank screen shows the content; authoring tools arrive in phase 4.</p>}
    </div>
  )
}

function ComingLater({ item }: { item: NavItem }) {
  return (
    <div className="card max-w-xl">
      <h1 className="text-lg font-bold">{item.label}</h1>
      <p className="text-sm text-stone-500">This screen arrives in {item.phase}.</p>
    </div>
  )
}
