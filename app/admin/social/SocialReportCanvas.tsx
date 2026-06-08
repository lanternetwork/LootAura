import {
  SOCIAL_REPORT_CANVAS_HEIGHT,
  SOCIAL_REPORT_CANVAS_WIDTH,
  SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE,
  SOCIAL_REPORT_MAP_PANEL_HEIGHT,
  SOCIAL_REPORT_MAP_PANEL_WIDTH,
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
  large = false,
}: {
  label: string
  value: string
  accent?: boolean
  large?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center rounded-xl border border-white/10 bg-[#0f1d32]/90 px-6 py-5 backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p
        className={`mt-2 truncate font-black leading-tight ${
          large ? 'text-4xl' : 'text-2xl'
        } ${accent ? 'text-[#F0B532]' : 'text-white'}`}
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
        {/* Hero */}
        <header
          className="relative shrink-0 bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-10 pb-5 pt-6"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.hero * 100}%` }}
        >
          <div className="flex h-full items-start justify-between gap-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <img
                  src="/sitelogo-on-dark.svg"
                  alt="Loot Aura"
                  className="h-10 w-auto shrink-0"
                />
                <span className="text-lg font-bold tracking-wide text-white">Loot Aura</span>
              </div>

              <h2 className="mt-4 text-[clamp(2.25rem,3.8vw,3.5rem)] font-black leading-[0.95] tracking-tight text-white">
                {cityTitle}
              </h2>
              <p className="mt-2 text-[clamp(1.15rem,1.9vw,1.6rem)] font-semibold text-[#F0B532]">
                Weekend Sale Report
              </p>
              <p className="mt-1.5 text-base font-medium text-white/80">{report.heroDateRange}</p>
            </div>

            <div
              className="shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 px-7 py-5 text-center shadow-lg"
              aria-label={
                report.cityRank != null
                  ? `Rank ${report.cityRank} among ranked metros this weekend`
                  : 'City rank not available for this metro'
              }
            >
              <p className="text-[clamp(2.5rem,4vw,3.25rem)] font-black leading-none text-[#F0B532]">
                {rankLabel}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
                Most Active City
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
                Ranked Metros
              </p>
            </div>
          </div>
        </header>

        {/* Body: contained map + prominent metrics (not full-width map strip) */}
        <section
          className="flex shrink-0 items-center justify-center gap-8 bg-[#0a1220] px-10"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.body * 100}%` }}
        >
          <div
            className="relative shrink-0 overflow-hidden rounded-xl border-2 border-[#F0B532]/35 bg-[#0c1628] shadow-inner"
            style={{
              width: SOCIAL_REPORT_MAP_PANEL_WIDTH,
              height: SOCIAL_REPORT_MAP_PANEL_HEIGHT,
            }}
          >
            <SocialReportMap
              mapPins={report.mapPins}
              mapViewport={report.mapViewport}
              className="h-full w-full rounded-lg border-0"
            />
            {report.mapPins.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0c1628]/50">
                <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
                  No sales in viewport this weekend
                </p>
              </div>
            )}
          </div>

          <div className="flex min-w-0 max-w-[360px] flex-1 flex-col gap-4">
            <MetricCard
              label="Active Sales"
              value={report.activeSales.toLocaleString('en-US')}
              accent
              large
            />
            <MetricCard label="City Rank" value={rankLabel} large />
          </div>
        </section>

        {/* Footer */}
        <footer
          className="flex shrink-0 items-center justify-center bg-[#080f1a] px-10"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.footer * 100}%` }}
        >
          <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-white/45">
            Data powered by LootAura.com
          </p>
        </footer>
      </div>
    </div>
  )
}
