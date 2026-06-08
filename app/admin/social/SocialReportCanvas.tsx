import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
  SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE,
} from '@/lib/admin/social/socialReportCanvasDimensions'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import SocialReportMap from './SocialReportMap'

type SocialReportCanvasProps = {
  report: SocialCityReport
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center rounded-lg border border-white/10 bg-[#0f1d32]/90 px-5 py-4 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p
        className={`mt-1 truncate text-2xl font-black leading-tight ${
          accent ? 'text-[#F0B532]' : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

/** Screenshot-ready social infographic canvas (no admin controls). */
export default function SocialReportCanvas({ report }: SocialReportCanvasProps) {
  const cityTitle = `${report.city.toUpperCase()}, ${report.state}`
  const rankLabel =
    report.cityRank != null ? `#${report.cityRank}` : 'N/A'

  return (
    <div
      data-testid="social-city-report"
      className="mx-auto w-full overflow-hidden rounded-sm shadow-2xl ring-1 ring-black/20"
      style={{
        width: SOCIAL_REPORT_CANVAS_WIDTH,
        maxWidth: '100%',
        height: SOCIAL_REPORT_CANVAS_HEIGHT,
        aspectRatio: `${SOCIAL_REPORT_CANVAS_WIDTH} / ${SOCIAL_REPORT_CANVAS_HEIGHT}`,
      }}
    >
      <div className="flex h-full min-h-0 flex-col bg-[#0c1628]">
        {/* Hero ~35% */}
        <header
          className="relative shrink-0 bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-10 pb-4 pt-6"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.hero * 100}%` }}
        >
          <div className="flex h-full items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <img
                  src="/sitelogo-on-dark.svg"
                  alt="Loot Aura"
                  className="h-10 w-auto shrink-0"
                />
                <span className="text-lg font-bold tracking-wide text-white">Loot Aura</span>
              </div>

              <h2 className="mt-3 text-[clamp(2rem,3.5vw,3.25rem)] font-black leading-[0.95] tracking-tight text-white">
                {cityTitle}
              </h2>
              <p className="mt-1.5 text-[clamp(1.1rem,1.8vw,1.5rem)] font-semibold text-[#F0B532]">
                Weekend Sale Report
              </p>
              <p className="mt-1 text-base font-medium text-white/80">{report.heroDateRange}</p>
            </div>

            <div
              className="shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 px-6 py-4 text-center shadow-lg"
              aria-label={
                report.cityRank != null
                  ? `Rank ${report.cityRank} among ranked metros this weekend`
                  : 'City rank not available for this metro'
              }
            >
              <p className="text-[clamp(2.25rem,4vw,3.5rem)] font-black leading-none text-[#F0B532]">
                {rankLabel}
              </p>
              <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
                Most Active City
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
                Ranked Metros
              </p>
            </div>
          </div>
        </header>

        {/* Map ~40% */}
        <section
          className="relative min-h-0 shrink-0 border-y border-[#F0B532]/25"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.map * 100}%` }}
        >
          <SocialReportMap
            mapPins={report.mapPins}
            mapViewport={report.mapViewport}
            className="h-full w-full rounded-none border-0"
          />
          {report.mapPins.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0c1628]/40">
              <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
                No sales in viewport this weekend
              </p>
            </div>
          )}
        </section>

        {/* Metrics + footer ~25% */}
        <footer
          className="flex shrink-0 flex-col justify-center bg-[#0a1220] px-10 py-4"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.footer * 100}%` }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard
              label="Active Sales"
              value={report.activeSales.toLocaleString('en-US')}
              accent
            />
            <MetricCard label="City Rank" value={rankLabel} />
          </div>
          <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-white/45">
            Data powered by LootAura.com
          </p>
        </footer>
      </div>
    </div>
  )
}
