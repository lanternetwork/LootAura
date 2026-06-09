import type { CSSProperties, ReactNode } from 'react'
import {
  getSocialReportFormat,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'
import { SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY } from '@/lib/admin/social/socialReportInstagramTypography'
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

export function CalendarIcon({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function TrophyIcon({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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

export function TagIcon({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
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

/** Stacked layers — total active sales across types. */
export function LayersIcon({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 12.5 10 16l6.5-3.5M3.5 8.5 10 12l6.5-3.5M3.5 4.5 10 8l6.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HouseIcon({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
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

export function SocialReportBrandPin({ heightPx }: { heightPx: number }) {
  return (
    <img
      src="/sitelogo.svg"
      alt=""
      aria-hidden="true"
      className="w-auto shrink-0"
      style={{ height: heightPx }}
    />
  )
}

function MetricIconBadge({
  children,
  bgClass,
  size = 'md',
  pixelSize,
}: {
  children: ReactNode
  bgClass: string
  size?: 'md' | 'lg' | 'xl'
  pixelSize?: number
}) {
  const sizeClass =
    pixelSize == null
      ? size === 'xl'
        ? 'h-14 w-14'
        : size === 'lg'
          ? 'h-12 w-12'
          : 'h-10 w-10'
      : ''
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${bgClass} ${sizeClass}`}
      style={pixelSize != null ? { width: pixelSize, height: pixelSize } : undefined}
    >
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
  wide = false,
  templateHero = false,
  icon,
}: {
  value: string
  cityTitle: string
  compact?: boolean
  fillBand?: boolean
  emphasize?: boolean
  wide?: boolean
  /** Instagram template hero metric — fixed px scale */
  templateHero?: boolean
  icon?: ReactNode
}) {
  const isHeroMetric = templateHero || (wide && emphasize && fillBand)
  const heroType = SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY
  const metricIcon =
    icon ?? (
      <LayersIcon
        style={
          isHeroMetric
            ? { width: heroType.heroMetricIconPx, height: heroType.heroMetricIconPx }
            : undefined
        }
        className={isHeroMetric ? undefined : 'h-5 w-5'}
      />
    )

  return (
    <div
      className={`flex min-w-0 items-center gap-4 rounded-2xl bg-[#0c1628] shadow-lg ${
        wide ? 'flex-[2]' : 'flex-1'
      } ${
        isHeroMetric
          ? fillBand
            ? 'h-full px-6 py-4'
            : 'px-5 py-2.5'
          : fillBand
            ? 'h-full px-6 py-4'
            : emphasize
              ? 'px-4 py-3.5'
              : compact
                ? 'px-4 py-4'
                : 'gap-4 px-5 py-4'
      }`}
    >
      <MetricIconBadge
        bgClass="bg-[#F0B532] text-[#0c1628]"
        pixelSize={isHeroMetric ? heroType.heroMetricIconBadgePx : undefined}
        size={isHeroMetric ? undefined : fillBand ? 'lg' : emphasize ? 'lg' : 'md'}
      >
        {metricIcon}
      </MetricIconBadge>
      <div className="min-w-0">
        {isHeroMetric ? (
          <>
            <p
              className="font-black leading-none text-white"
              style={{ fontSize: heroType.heroMetricValuePx }}
            >
              {value}
            </p>
            <p
              className={`font-bold uppercase tracking-[0.14em] text-[#F0B532] ${fillBand ? 'mt-2' : 'mt-1'}`}
              style={{ fontSize: heroType.heroMetricLabelPx }}
            >
              Active Sales
            </p>
            {(fillBand || !compact) && (
              <p
                className={`font-medium text-white/75 ${fillBand ? 'mt-1' : 'mt-0.5'}`}
                style={{ fontSize: heroType.heroMetricSubtitlePx }}
              >
                Across {cityTitle}
              </p>
            )}
          </>
        ) : (
          <>
            <p
              className={`font-black leading-none text-white ${
                emphasize
                  ? 'text-[2.25rem]'
                  : fillBand
                    ? 'text-[2rem]'
                    : compact
                      ? 'text-3xl'
                      : 'text-[2rem]'
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
          </>
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
  stacked = false,
  templateStacked = false,
}: {
  value: string
  label: string
  accentColor: string
  iconBgClass: string
  icon: ReactNode
  compact?: boolean
  fillBand?: boolean
  /** Instagram template — icon above value above label */
  stacked?: boolean
  templateStacked?: boolean
}) {
  const heroType = SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY

  if (templateStacked && stacked) {
    return (
      <div
        className={`flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-slate-200 bg-white px-3 shadow-md ${
          fillBand ? 'h-full justify-center py-4' : 'py-2'
        }`}
      >
        <MetricIconBadge bgClass={iconBgClass} pixelSize={heroType.secondaryMetricIconBadgePx}>
          {icon}
        </MetricIconBadge>
        <p
          className={`font-black leading-none text-[#0c1628] ${fillBand ? 'mt-3' : 'mt-2'}`}
          style={{ fontSize: heroType.secondaryMetricValuePx }}
        >
          {value}
        </p>
        <p
          className={`font-bold uppercase tracking-[0.14em] ${fillBand ? 'mt-2' : 'mt-1'}`}
          style={{ fontSize: heroType.secondaryMetricLabelPx, color: accentColor }}
        >
          {label}
        </p>
      </div>
    )
  }

  if (stacked && fillBand) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-md">
        <MetricIconBadge bgClass={iconBgClass} size="lg">
          {icon}
        </MetricIconBadge>
        <p
          className="mt-3 font-black leading-none text-[#0c1628]"
          style={{ fontSize: heroType.secondaryMetricValuePx }}
        >
          {value}
        </p>
        <p
          className="mt-2 font-bold uppercase tracking-[0.14em]"
          style={{ fontSize: heroType.secondaryMetricLabelPx, color: accentColor }}
        >
          {label}
        </p>
      </div>
    )
  }

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
            fillBand ? 'text-[1.5rem]' : compact ? 'text-2xl' : 'text-[1.625rem]'
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
  const edgeToEdge = definition.mapEdgeToEdge === true
  const sectionPaddingClass = edgeToEdge ? '' : horizontalPaddingClass
  const mapPanel = (
    <div
      className={`relative shrink-0 overflow-hidden bg-slate-100 ${
        edgeToEdge
          ? 'h-full w-full'
          : `rounded-xl border border-slate-200 shadow-sm ${layout === 'band' ? 'h-full' : ''}`
      }`}
      style={{
        width: edgeToEdge ? '100%' : definition.mapPanelWidth,
        ...(layout === 'band-centered' || layout === 'content'
          ? { height: definition.mapPanelHeight }
          : {}),
      }}
    >
      <SocialReportMap
        mapPins={report.mapPins}
        mapViewport={report.mapViewport}
        className={`h-full w-full border-0 ${edgeToEdge ? '' : 'rounded-lg'}`}
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
        className={`flex shrink-0 bg-white pt-3 pb-0 ${edgeToEdge ? '' : 'justify-center'} ${sectionPaddingClass}`}
      >
        {mapPanel}
      </section>
    )
  }

  if (layout === 'band-centered') {
    return (
      <section
        className={`flex shrink-0 bg-white ${edgeToEdge ? '' : 'items-center justify-center'} ${sectionPaddingClass}`}
        style={{ height: `${definition.layoutHeightShares.map * 100}%` }}
      >
        {mapPanel}
      </section>
    )
  }

  return (
    <section
      className={`flex shrink-0 bg-white ${edgeToEdge ? 'w-full' : 'justify-center'} ${sectionPaddingClass}`}
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
  size?: 'md' | 'lg' | 'xl'
}) {
  const isXl = size === 'xl'
  const isLarge = size === 'lg' || isXl
  const typeScale = SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY

  return (
    <div
      className={`shrink-0 rounded-2xl border-2 border-[#F0B532] bg-[#0a1220]/80 text-center shadow-lg ${
        isXl ? 'px-10 py-5' : isLarge ? 'px-8 py-5' : 'px-5 py-3'
      }`}
      aria-label={
        cityRank != null
          ? `Rank ${cityRank} among ranked metros this weekend`
          : 'City rank not available for this metro'
      }
    >
      <div className="flex items-center justify-center gap-2">
        <TrophyIcon
          className={isXl ? undefined : isLarge ? 'h-8 w-8 text-[#F0B532]' : 'h-6 w-6 text-[#F0B532]'}
          style={
            isXl
              ? { width: typeScale.rankTrophyPx, height: typeScale.rankTrophyPx, color: '#F0B532' }
              : undefined
          }
        />
        {cityRank != null ? (
          <p
            className={`inline-flex items-baseline font-black leading-none text-[#F0B532] ${
              isXl ? '' : isLarge ? 'text-5xl' : 'text-[2.25rem]'
            }`}
            style={isXl ? { fontSize: typeScale.rankNumberPx } : undefined}
          >
            <span>#</span>
            <span style={{ marginLeft: isXl ? 10 : isLarge ? 8 : 6 }}>{cityRank}</span>
          </p>
        ) : (
          <p
            className={`font-black leading-none text-[#F0B532] ${
              isXl ? '' : isLarge ? 'text-5xl' : 'text-[2.25rem]'
            }`}
            style={isXl ? { fontSize: typeScale.rankNumberPx } : undefined}
          >
            {rankLabel}
          </p>
        )}
      </div>
      <p
        className={`mt-1.5 font-bold uppercase tracking-[0.14em] text-white ${
          isXl ? '' : 'text-[9px]'
        }`}
        style={isXl ? { fontSize: typeScale.rankCaptionPx } : undefined}
      >
        Most Active City
      </p>
      <p
        className={`mt-0.5 font-semibold uppercase tracking-[0.12em] text-white/65 ${
          isXl ? '' : 'text-[9px]'
        }`}
        style={isXl ? { fontSize: typeScale.rankCaptionPx } : undefined}
      >
        This Weekend
      </p>
    </div>
  )
}
