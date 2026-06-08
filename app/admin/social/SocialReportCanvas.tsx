import type { ReactNode } from 'react'
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4h10v3a5 5 0 0 1-10 0V4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M9 20h6M12 17v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M5 7H3.5a2.5 2.5 0 0 0 0 5H5M19 7h1.5a2.5 2.5 0 0 1 0 5H19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4.25l2.75 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 10h13M10 3.5a10 10 0 0 1 0 13M10 3.5a10 10 0 0 0 0 13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10.5V6.75A1.75 1.75 0 0 1 5.75 5H9.5l6.25 6.25a1.25 1.25 0 0 1 0 1.77l-2.23 2.23a1.25 1.25 0 0 1-1.77 0L4 10.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.25" cy="7.25" r="1" fill="currentColor" />
    </svg>
  )
}

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 9.25 10 4l6 5.25V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 16v-4.5h4V16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function GarageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 8.5 10 4l6 4.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 16v-3.5h6V16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MetricIconBadge({
  children,
  bgClass,
}: {
  children: ReactNode
  bgClass: string
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${bgClass}`}
    >
      {children}
    </div>
  )
}

function PrimaryMetricCard({
  value,
  cityTitle,
}: {
  value: string
  cityTitle: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl bg-[#0c1628] px-6 py-5 shadow-lg">
      <MetricIconBadge bgClass="bg-[#F0B532] text-[#0c1628]">
        <TagIcon className="h-5 w-5" />
      </MetricIconBadge>
      <div className="min-w-0">
        <p className="text-[clamp(2rem,3vw,2.75rem)] font-black leading-none text-white">{value}</p>
        <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#F0B532]">
          Active Sales
        </p>
        <p className="mt-1 text-sm font-medium text-white/75">Across {cityTitle}</p>
      </div>
    </div>
  )
}

function SecondaryMetricCard({
  value,
  label,
  accentColor,
  iconBgClass,
  icon,
}: {
  value: string
  label: string
  accentColor: string
  iconBgClass: string
  icon: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-md">
      <MetricIconBadge bgClass={iconBgClass}>{icon}</MetricIconBadge>
      <div className="min-w-0">
        <p className="text-[clamp(1.75rem,2.5vw,2.25rem)] font-black leading-none text-[#0c1628]">
          {value}
        </p>
        <p
          className="mt-1.5 text-xs font-bold uppercase tracking-[0.16em]"
          style={{ color: accentColor }}
        >
          {label}
        </p>
      </div>
    </div>
  )
}

function formatHeroDateUpper(heroDateRange: string): string {
  return heroDateRange.toUpperCase().replace(/\u2013/g, ' - ')
}

function formatFooterTimestamp(timestampLabel: string): string {
  return timestampLabel.replaceAll('\n', ' \u2022 ').toUpperCase()
}

function formatWeekendShortLabel(heroDateRange: string): string {
  const match = heroDateRange.match(/^(\w+)\s+(\d+)(?:\u2013(\d+))?,\s*(\d{4})$/)
  if (!match) return heroDateRange.toUpperCase()
  const [, month, startDay, endDay, year] = match
  const monthShort = month.slice(0, 3).toUpperCase()
  if (endDay) {
    return `${monthShort} ${startDay}\u2013${endDay}`
  }
  return `${monthShort} ${startDay}, ${year}`
}

/** Screenshot-ready social infographic canvas (no admin controls). */
export default function SocialReportCanvas({ report }: SocialReportCanvasProps) {
  const cityTitle = `${report.city}, ${report.state}`
  const cityTitleUpper = `${report.city.toUpperCase()}, ${report.state}`
  const rankLabel = report.cityRank != null ? `#${report.cityRank}` : 'N/A'
  const weekendShort = formatWeekendShortLabel(report.heroDateRange)
  const footerTimestamp = formatFooterTimestamp(report.timestampLabel)
  const heroDateUpper = formatHeroDateUpper(report.heroDateRange)

  return (
    <div
      data-testid="social-city-report"
      className="shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10"
      style={{
        width: SOCIAL_REPORT_CANVAS_WIDTH,
        height: SOCIAL_REPORT_CANVAS_HEIGHT,
      }}
    >
      <div className="flex h-full min-h-0 flex-col bg-white">
        {/* Header */}
        <header
          className="relative shrink-0 bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-10 pb-5 pt-6"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.header * 100}%` }}
        >
          <div className="flex h-full items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <img
                      src="/sitelogo-on-dark.svg"
                      alt="Loot Aura"
                      className="h-10 w-auto shrink-0"
                    />
                    <span className="text-lg font-bold tracking-wide text-white">Loot Aura</span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#F0B532]">
                    Local Sales. Real Treasures.
                  </p>
                </div>

                <div
                  className="flex shrink-0 items-center gap-2 rounded-full border border-[#F0B532]/70 bg-[#0a1220]/90 px-4 py-1.5"
                  aria-hidden="true"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-white">
                    {cityTitleUpper}
                  </span>
                  <ChevronDownIcon className="h-3.5 w-3.5 text-[#F0B532]" />
                </div>
              </div>

              <h2 className="mt-3 text-[clamp(2.25rem,3.8vw,3.5rem)] font-black leading-[0.95] tracking-tight text-white">
                {cityTitleUpper}
              </h2>
              <p className="mt-2 text-[clamp(1.15rem,1.9vw,1.6rem)] font-semibold uppercase text-[#F0B532]">
                Weekend Sale Report
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-white/90">
                <CalendarIcon className="h-4 w-4 shrink-0 text-white/80" />
                <span>{heroDateUpper}</span>
              </div>
            </div>

            <div
              className="shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 px-6 py-4 text-center shadow-lg"
              aria-label={
                report.cityRank != null
                  ? `Rank ${report.cityRank} among ranked metros this weekend`
                  : 'City rank not available for this metro'
              }
            >
              <div className="flex items-center justify-center gap-2">
                <TrophyIcon className="h-7 w-7 text-[#F0B532]" />
                <p className="text-[clamp(2.25rem,3.5vw,3rem)] font-black leading-none text-[#F0B532]">
                  {rankLabel}
                </p>
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                Most Active City
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
                This Weekend
              </p>
            </div>
          </div>
        </header>

        {/* Map */}
        <section
          className="flex shrink-0 items-center justify-center bg-white px-10"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.map * 100}%` }}
        >
          <div
            className="relative shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
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
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                  No sales in viewport this weekend
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Metrics */}
        <section
          className="flex shrink-0 items-center bg-white px-10"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.metrics * 100}%` }}
        >
          <div className="flex w-full gap-4">
            <PrimaryMetricCard
              value={report.activeSales.toLocaleString('en-US')}
              cityTitle={cityTitle}
            />
            <SecondaryMetricCard
              value={report.yardSales.toLocaleString('en-US')}
              label="Yard Sales"
              accentColor="#DC2626"
              iconBgClass="bg-red-600 text-white"
              icon={<TagIcon className="h-5 w-5" />}
            />
            <SecondaryMetricCard
              value={report.estateSales.toLocaleString('en-US')}
              label="Estate Sales"
              accentColor="#7C3AED"
              iconBgClass="bg-violet-600 text-white"
              icon={<HouseIcon className="h-5 w-5" />}
            />
            <SecondaryMetricCard
              value={weekendShort}
              label="This Weekend"
              accentColor="#2563EB"
              iconBgClass="bg-blue-600 text-white"
              icon={<GarageIcon className="h-5 w-5" />}
            />
          </div>
        </section>

        {/* Footer */}
        <footer
          className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-10"
          style={{ height: `${SOCIAL_REPORT_LAYOUT_HEIGHT_SHARE.footer * 100}%` }}
        >
          <div className="flex items-center gap-3">
            <ClockIcon className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Updated
              </p>
              <p className="text-sm font-bold text-slate-900">{footerTimestamp}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <GlobeIcon className="h-5 w-5 text-slate-500" />
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Data Powered By
              </p>
              <p className="text-sm font-bold uppercase tracking-[0.08em] text-slate-900">
                LootAura.com
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
