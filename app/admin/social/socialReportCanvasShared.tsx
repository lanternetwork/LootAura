import type { ReactNode } from 'react'
import {
  getSocialReportFormat,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import SocialReportMap from './SocialReportMap'

export function formatHeroDateUpper(heroDateRange: string): string {
  return heroDateRange.toUpperCase().replace(/\u2013/g, ' - ')
}

export function formatFooterTimestamp(timestampLabel: string): string {
  return timestampLabel.replaceAll('\n', ' \u2022 ').toUpperCase()
}

export function SocialReportCanvasFrame({
  format,
  children,
}: {
  format: SocialReportFormatSlug
  children: ReactNode
}) {
  const definition = getSocialReportFormat(format)
  return (
    <div
      data-testid="social-city-report"
      data-format={format}
      className="box-border shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10"
      style={{
        width: definition.canvasWidth,
        minWidth: definition.canvasWidth,
        maxWidth: definition.canvasWidth,
        height: definition.canvasHeight,
      }}
    >
      <div className="flex h-full min-h-0 flex-col bg-white">{children}</div>
    </div>
  )
}

export function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function TrophyIcon({ className }: { className?: string }) {
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

export function ChevronDownIcon({ className }: { className?: string }) {
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

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4.25l2.75 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 10h13M10 3.5a10 10 0 0 1 0 13M10 3.5a10 10 0 0 0 0 13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function TagIcon({ className }: { className?: string }) {
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

export function HouseIcon({ className }: { className?: string }) {
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

function MetricIconBadge({
  children,
  bgClass,
  size = 'md',
}: {
  children: ReactNode
  bgClass: string
  size?: 'md' | 'lg'
}) {
  const sizeClass = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full ${bgClass}`}>
      {children}
    </div>
  )
}

export function PrimaryMetricCard({
  value,
  cityTitle,
  compact = false,
  fillBand = false,
  emphasize = false,
}: {
  value: string
  cityTitle: string
  compact?: boolean
  fillBand?: boolean
  emphasize?: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#0c1628] shadow-lg ${
        fillBand ? 'h-full px-5 py-5' : emphasize ? 'px-4 py-3.5' : compact ? 'px-4 py-4' : 'gap-4 px-5 py-4'
      }`}
    >
      <MetricIconBadge
        bgClass="bg-[#F0B532] text-[#0c1628]"
        size={fillBand ? 'lg' : emphasize ? 'lg' : 'md'}
      >
        <TagIcon className="h-5 w-5" />
      </MetricIconBadge>
      <div className="min-w-0">
        <p
          className={`font-black leading-none text-white ${
            emphasize ? 'text-[2.25rem]' : fillBand ? 'text-[2rem]' : compact ? 'text-3xl' : 'text-[2rem]'
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F0B532]">
          Active Sales
        </p>
        {(fillBand || !compact) && (
          <p className="mt-0.5 text-xs font-medium text-white/75">Across {cityTitle}</p>
        )}
      </div>
    </div>
  )
}

export function SecondaryMetricCard({
  value,
  label,
  accentColor,
  iconBgClass,
  icon,
  compact = false,
  fillBand = false,
}: {
  value: string
  label: string
  accentColor: string
  iconBgClass: string
  icon: ReactNode
  compact?: boolean
  fillBand?: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white shadow-md ${
        fillBand ? 'h-full px-5 py-5' : compact ? 'px-4 py-4' : 'px-4 py-4'
      }`}
    >
      <MetricIconBadge bgClass={iconBgClass} size={fillBand ? 'lg' : 'md'}>
        {icon}
      </MetricIconBadge>
      <div className="min-w-0">
        <p
          className={`font-black leading-none text-[#0c1628] ${
            fillBand ? 'text-[1.75rem]' : compact ? 'text-2xl' : 'text-[1.625rem]'
          }`}
        >
          {value}
        </p>
        <p
          className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: accentColor }}
        >
          {label}
        </p>
      </div>
    </div>
  )
}

export function SocialReportSectionGap({ format }: { format: SocialReportFormatSlug }) {
  const gapShare = getSocialReportFormat(format).sectionGapShare
  if (!gapShare) {
    return null
  }

  return (
    <div
      className="shrink-0 bg-white"
      style={{ height: `${gapShare * 100}%` }}
      aria-hidden="true"
    />
  )
}

export function SocialReportMapSection({
  report,
  format,
  horizontalPaddingClass = 'px-8',
  layout = 'band',
}: {
  report: SocialCityReport
  format: SocialReportFormatSlug
  horizontalPaddingClass?: string
  /** band = fill band; band-centered = fixed panel centered in band; content = hug panel */
  layout?: 'band' | 'band-centered' | 'content'
}) {
  const definition = getSocialReportFormat(format)
  const mapPanel = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm ${
        layout === 'band' ? 'h-full' : ''
      }`}
      style={{
        width: definition.mapPanelWidth,
        ...(layout === 'band-centered' || layout === 'content'
          ? { height: definition.mapPanelHeight }
          : {}),
      }}
    >
      <SocialReportMap
        mapPins={report.mapPins}
        mapViewport={report.mapViewport}
        className="h-full w-full rounded-lg border-0"
      />
      {report.mapPins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            No sales in viewport this weekend
          </p>
        </div>
      )}
    </div>
  )

  if (layout === 'content') {
    return (
      <section
        className={`flex shrink-0 justify-center bg-white pt-3 pb-0 ${horizontalPaddingClass}`}
      >
        {mapPanel}
      </section>
    )
  }

  if (layout === 'band-centered') {
    return (
      <section
        className={`flex shrink-0 items-center justify-center bg-white ${horizontalPaddingClass}`}
        style={{ height: `${definition.layoutHeightShares.map * 100}%` }}
      >
        {mapPanel}
      </section>
    )
  }

  return (
    <section
      className={`flex shrink-0 justify-center bg-white ${horizontalPaddingClass}`}
      style={{ height: `${definition.layoutHeightShares.map * 100}%` }}
    >
      {mapPanel}
    </section>
  )
}

export function SocialReportFooter({
  report,
  format,
  horizontalPaddingClass = 'px-8',
  layout = 'band',
  density = 'default',
}: {
  report: SocialCityReport
  format: SocialReportFormatSlug
  horizontalPaddingClass?: string
  layout?: 'band' | 'content'
  density?: 'default' | 'compact'
}) {
  const definition = getSocialReportFormat(format)
  const footerTimestamp = formatFooterTimestamp(report.timestampLabel)
  const isCompact = density === 'compact'
  const className = `flex shrink-0 items-center justify-between border-t border-slate-200 bg-white ${
    isCompact ? 'py-2' : 'py-4'
  } ${horizontalPaddingClass}`

  const clockIconClass = isCompact ? 'h-3.5 w-3.5 text-slate-500' : 'h-4 w-4 text-slate-500'
  const labelClass = isCompact
    ? 'text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-500'
    : 'text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500'
  const valueClass = isCompact
    ? 'text-[10px] font-bold text-slate-900'
    : 'text-xs font-bold text-slate-900'

  const footerBody = (
    <>
      <div className="flex items-center gap-2">
        <ClockIcon className={clockIconClass} />
        <div>
          <p className={labelClass}>Updated</p>
          <p className={valueClass}>{footerTimestamp}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <GlobeIcon className={clockIconClass} />
        <div className="text-right">
          <p className={labelClass}>Data Powered By</p>
          <p className={`${valueClass} uppercase tracking-[0.08em]`}>LootAura.com</p>
        </div>
      </div>
    </>
  )

  if (layout === 'content') {
    return <footer className={className}>{footerBody}</footer>
  }

  return (
    <footer
      className={className}
      style={{ height: `${definition.layoutHeightShares.footer * 100}%` }}
    >
      {footerBody}
    </footer>
  )
}

export function SocialReportRankBadge({
  rankLabel,
  cityRank,
  size = 'md',
}: {
  rankLabel: string
  cityRank: number | null
  size?: 'md' | 'lg'
}) {
  const isLarge = size === 'lg'
  return (
    <div
      className={`shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 text-center shadow-lg ${
        isLarge ? 'px-8 py-5' : 'px-5 py-3'
      }`}
      aria-label={
        cityRank != null
          ? `Rank ${cityRank} among ranked metros this weekend`
          : 'City rank not available for this metro'
      }
    >
      <div className="flex items-center justify-center gap-2">
        <TrophyIcon className={isLarge ? 'h-8 w-8 text-[#F0B532]' : 'h-6 w-6 text-[#F0B532]'} />
        <p className={`font-black leading-none text-[#F0B532] ${isLarge ? 'text-5xl' : 'text-[2.25rem]'}`}>
          {rankLabel}
        </p>
      </div>
      <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
        Most Active City
      </p>
      <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/65">
        This Weekend
      </p>
    </div>
  )
}
