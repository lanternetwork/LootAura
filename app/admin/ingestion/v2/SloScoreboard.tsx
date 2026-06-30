import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { sloTone, TONE_TEXT } from '@/app/admin/ingestion/v2/dashboardUxHelpers'

function sloIcon(pass: boolean, blocking: boolean): string {
  if (pass) return '✔'
  if (blocking) return '✖'
  return '△'
}

export function SloScoreboard({ model }: { model: IngestionDiagnosticsModel }) {
  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
        SLO Scoreboard
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">SLO</th>
              <th className="py-2 pr-3">Actual</th>
              <th className="py-2 pr-3">Target</th>
              <th className="py-2">Blocking</th>
            </tr>
          </thead>
          <tbody>
            {model.slos.map((slo) => {
              const tone = sloTone(slo)
              return (
                <tr key={slo.id} className="border-b border-gray-100">
                  <td className={`py-2 pr-3 font-semibold ${TONE_TEXT[tone]}`}>
                    {sloIcon(slo.pass, slo.blocking)}
                  </td>
                  <td className="py-2 pr-3">{slo.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{slo.actual}</td>
                  <td className="py-2 pr-3 tabular-nums">{slo.target}</td>
                  <td className="py-2">{slo.blocking ? 'Yes' : 'No'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
