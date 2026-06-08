import Image from 'next/image'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import SocialReportMap from './SocialReportMap'

type SocialReportCanvasProps = {
  report: SocialCityReport
}

function formatTimestampSingleLine(timestampLabel: string): string {
  return timestampLabel.replace(/\n/g, ' · ')
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

  return (
    <div
      data-testid="social-city-report"
      className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-sm shadow-2xl ring-1 ring-black/20"
      style={{ aspectRatio: '16 / 9' }}
    >
      <div className="flex h-full min-h-0 flex-col bg-[#0c1628]">
        {/* Hero */}
        <header className="relative shrink-0 bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-10 pb-6 pt-7">
          <div className="flex items-start justify-between gap-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <Image
                  src="/sitelogo.svg"
                  alt="Loot Aura"
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0"
                />
                <span className="text-lg font-bold tracking-wide text-white">Loot Aura</span>
              </div>

              <h2 className="mt-5 text-[clamp(2.5rem,4.5vw,4.25rem)] font-black leading-[0.95] tracking-tight text-white">
                {cityTitle}
              </h2>
              <p className="mt-2 text-[clamp(1.25rem,2vw,1.75rem)] font-semibold text-[#F0B532]">
                Weekend Sale Report
              </p>
              <p className="mt-1 text-lg font-medium text-white/80">{report.heroDateRange}</p>
            </div>

            <div
              className="shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 px-8 py-6 text-center shadow-lg"
              aria-label={`Rank ${report.cityRank} most active city this weekend`}
            >
              <p className="text-[clamp(3rem,5vw,4.5rem)] font-black leading-none text-[#F0B532]">
                #{report.cityRank}
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.14em] text-white">
                Most Active City
              </p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                This Weekend
              </p>
            </div>
          </div>
        </header>

        {/* Map */}
        <section className="relative min-h-0 flex-1 border-y border-[#F0B532]/25">
          <SocialReportMap
            mapPins={report.mapPins}
            mapFitBounds={report.mapFitBounds}
            className="h-full min-h-[280px] rounded-none border-0"
          />
          {report.mapPins.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0c1628]/40">
              <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
                No map pins this weekend
              </p>
            </div>
          )}
        </section>

        {/* Bottom metrics + footer */}
        <footer className="shrink-0 bg-[#0a1220] px-10 py-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Active Sales"
              value={report.activeSales.toLocaleString('en-US')}
              accent
            />
            <MetricCard label="City Rank" value={`#${report.cityRank}`} />
            <MetricCard label="Weekend Dates" value={report.heroDateRange} />
            <MetricCard
              label="Updated"
              value={formatTimestampSingleLine(report.timestampLabel)}
            />
          </div>
          <p className="mt-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-white/45">
            Data powered by LootAura.com
          </p>
        </footer>
      </div>
    </div>
  )
}
