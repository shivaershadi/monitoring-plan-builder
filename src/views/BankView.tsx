import type { Bank } from '../bank/loader'

const SUPPORT: Record<string, { label: string; cls: string }> = {
  supported: { label: 'supported', cls: 'bg-green-100 text-green-800' },
  not_yet_supported: { label: 'not yet supported', cls: 'bg-stone-200 text-stone-700' },
  proposal_pending: { label: 'proposal pending', cls: 'bg-amber-100 text-amber-800' },
}

export function BankView({ bank }: { bank: Bank }) {
  return (
    <div>
      <h1 className="text-xl font-bold">Bank <span className="chip bg-stone-200 text-stone-700">adviser mode</span></h1>
      <p className="mb-4 text-stone-500">The approved, versioned content every country office assembles from. Release {bank.release.version} ({bank.release.date}).</p>
      {bank.packages.map((pkg) => (
        <section key={pkg.package_id} className="card mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">{pkg.competency.name} · {pkg.package_id} <span className="text-xs text-stone-500">v{pkg.version}</span></h2>
            <span className="text-xs text-stone-500">{pkg.modules.length} modules · {pkg.choice_lists.length} choice lists · {pkg.activities.length} activities</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-1 pr-2">Indicator</th><th className="py-1 pr-2">Result</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Modality</th><th className="py-1 pr-2">Timing</th><th className="py-1 pr-2">Modules</th><th className="py-1">Support</th>
              </tr>
            </thead>
            <tbody>
              {pkg.indicators.map((i) => {
                const s = SUPPORT[i.support]
                const result = pkg.results.find((r) => r.id === i.result)?.name ?? i.result
                return (
                  <tr key={i.id} className="border-t border-stone-100 align-top">
                    <td className="py-1.5 pr-2"><b>{i.id}</b><div className="text-xs text-stone-600">{i.title_template}</div></td>
                    <td className="py-1.5 pr-2">{result}</td>
                    <td className="py-1.5 pr-2">{i.status}</td>
                    <td className="py-1.5 pr-2">{i.modality}</td>
                    <td className="py-1.5 pr-2 text-xs">{i.timing ? `${i.timing.offset.value} ${i.timing.offset.unit} after ${i.timing.anchor}${i.timing.parameter_key ? ` (param ${i.timing.parameter_key})` : ''}` : '—'}</td>
                    <td className="py-1.5 pr-2 text-xs">{i.modules.join(', ') || '—'}</td>
                    <td className="py-1.5"><span className={`chip ${s.cls}`}>{s.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
      {bank.release.changelog.length > 0 && (
        <div className="text-xs text-stone-500"><b>Changelog</b><ul className="list-disc pl-5">{bank.release.changelog.map((c) => <li key={c}>{c}</li>)}</ul></div>
      )}
    </div>
  )
}
