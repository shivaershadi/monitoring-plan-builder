import { useMemo, useState } from 'react'
import { loadBank } from './bank/loader'
import { BankView } from './views/BankView'
import { PlannerSandbox } from './views/PlannerSandbox'

type Screen = 'bank' | 'planner'

const NAV: Array<{ id: Screen; label: string; section: string }> = [
  { id: 'planner', label: 'Visits (sandbox)', section: 'Plan' },
  { id: 'bank', label: 'Bank', section: 'Adviser' },
]

export default function App() {
  const bank = useMemo(() => loadBank(), [])
  const [screen, setScreen] = useState<Screen>('planner')
  const indicatorCount = bank.packages.reduce((n, p) => n + p.indicators.length, 0)

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="border-b border-stone-200 bg-white p-3 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="mb-4 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-nrc font-extrabold text-white">N</div>
          <div>
            <div className="text-sm font-bold">Monitoring Plan Builder</div>
            <div className="text-[11px] text-stone-500">
              Bank v{bank.release.version} · {bank.packages.length} package{bank.packages.length === 1 ? '' : 's'} · {indicatorCount} indicators
            </div>
          </div>
        </div>
        <nav>
          {['Plan', 'Adviser'].map((section) => (
            <div key={section}>
              <div className="mt-3 px-2 text-[11px] uppercase tracking-wide text-stone-500">{section}</div>
              {NAV.filter((n) => n.section === section).map((n) => (
                <button
                  key={n.id}
                  onClick={() => setScreen(n.id)}
                  aria-current={screen === n.id ? 'page' : undefined}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${screen === n.id ? 'bg-nrc-soft font-semibold text-nrc-ink' : 'hover:bg-stone-100'}`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-6 px-2 text-[11px] text-stone-500">Phase 0 foundations. Intervention canvas, indicator board, instruments and package come in phases 1 and 2.</div>
      </aside>
      <main className="p-6">
        {bank.problems.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <b>Bank problems:</b>
            <ul className="list-disc pl-5">{bank.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {screen === 'bank' ? <BankView bank={bank} /> : <PlannerSandbox bank={bank} />}
      </main>
    </div>
  )
}
