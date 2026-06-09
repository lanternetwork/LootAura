import { getSocialReportFormat } from '@/lib/admin/social/socialReportFormats'
import { SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY } from '@/lib/admin/social/socialReportInstagramTypography'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import {
  CalendarIcon,
  formatHeroDateUpper,
  HouseIcon,
  PrimaryMetricCard,
  SecondaryMetricCard,
  SocialReportBrandPin,
  SocialReportCanvasFrame,
  SocialReportFooter,
  SocialReportMapSection,
  SocialReportRankBadge,
  TagIcon,
} from './socialReportCanvasShared'

type SocialReportInstagramFeedCanvasProps = {
  report: SocialCityReport
}

/** Instagram feed portrait canvas — 1080×1350 (4:5). */
export default function SocialReportInstagramFeedCanvas({
  report,
}: SocialReportInstagramFeedCanvasProps) {
  const format = 'instagram-feed' as const
  const definition = getSocialReportFormat(format)
  const typeScale = SOCIAL_REPORT_INSTAGRAM_TYPOGRAPHY
  const cityTitle = `${report.city}, ${report.state}`
  const cityTitleUpper = `${report.city.toUpperCase()}, ${report.state}`
  const rankLabel = report.cityRank != null ? `#${report.cityRank}` : 'N/A'
  const heroDateUpper = formatHeroDateUpper(report.heroDateRange)

  return (
    <SocialReportCanvasFrame format={format}>
      <header
        className="flex shrink-0 flex-col justify-center bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-8 py-3"
        style={{ height: `${definition.layoutHeightShares.header * 100}%` }}
      >
        <div className="flex items-center gap-3">
          <SocialReportBrandPin heightPx={typeScale.brandPinHeightPx} />
          <span
            className="font-bold tracking-wide text-white"
            style={{ fontSize: typeScale.brandNamePx }}
          >
            Loot Aura
          </span>
        </div>
        <p
          className="mt-1.5 font-bold uppercase tracking-[0.2em] text-[#F0B532]"
          style={{ fontSize: typeScale.brandTaglinePx }}
        >
          Local Sales. Real Treasures.
        </p>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              className="font-black leading-[0.9] tracking-tight text-white"
              style={{ fontSize: typeScale.cityTitlePx }}
            >
              {cityTitleUpper}
            </h2>
            <p
              className="mt-1.5 font-bold uppercase text-[#F0B532]"
              style={{ fontSize: typeScale.weekendReportPx }}
            >
              Weekend Sale Report
            </p>
            <div
              className="mt-1.5 flex items-center gap-2 font-semibold uppercase tracking-[0.08em] text-white/85"
              style={{ fontSize: typeScale.dateLinePx }}
            >
              <CalendarIcon
                className="shrink-0 text-white/75"
                style={{ width: typeScale.dateLinePx + 2, height: typeScale.dateLinePx + 2 }}
              />
              <span>{heroDateUpper}</span>
            </div>
          </div>
          <SocialReportRankBadge rankLabel={rankLabel} cityRank={report.cityRank} size="xl" />
        </div>
      </header>

      <SocialReportMapSection report={report} format={format} />

      <section
        className="flex shrink-0 items-stretch bg-white px-8 py-2"
        style={{ height: `${definition.layoutHeightShares.metrics * 100}%` }}
      >
        <div className="grid h-full w-full grid-cols-[2fr_1fr_1fr] items-stretch gap-3">
          <PrimaryMetricCard
            value={report.activeSales.toLocaleString('en-US')}
            cityTitle={cityTitle}
            wide
            templateHero
          />
          <SecondaryMetricCard
            value={report.yardSales.toLocaleString('en-US')}
            label="Yard Sales"
            accentColor="#DC2626"
            iconBgClass="bg-red-600 text-white"
            icon={
              <TagIcon
                style={{
                  width: typeScale.secondaryMetricIconPx,
                  height: typeScale.secondaryMetricIconPx,
                }}
              />
            }
            templateInline
          />
          <SecondaryMetricCard
            value={report.estateSales.toLocaleString('en-US')}
            label="Estate Sales"
            accentColor="#7C3AED"
            iconBgClass="bg-violet-600 text-white"
            icon={
              <HouseIcon
                style={{
                  width: typeScale.secondaryMetricIconPx,
                  height: typeScale.secondaryMetricIconPx,
                }}
              />
            }
            templateInline
          />
        </div>
      </section>

      <SocialReportFooter report={report} format={format} density="compact" />
    </SocialReportCanvasFrame>
  )
}
