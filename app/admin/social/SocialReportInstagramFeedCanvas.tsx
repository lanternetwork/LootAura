import { getSocialReportFormat } from '@/lib/admin/social/socialReportFormats'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import {
  CalendarIcon,
  formatHeroDateUpper,
  HouseIcon,
  PrimaryMetricCard,
  SecondaryMetricCard,
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
  const cityTitle = `${report.city}, ${report.state}`
  const cityTitleUpper = `${report.city.toUpperCase()}, ${report.state}`
  const rankLabel = report.cityRank != null ? `#${report.cityRank}` : 'N/A'
  const heroDateUpper = formatHeroDateUpper(report.heroDateRange)

  return (
    <SocialReportCanvasFrame format={format}>
      <header
        className="flex shrink-0 items-center bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-8"
        style={{ height: `${definition.layoutHeightShares.header * 100}%` }}
      >
        <div className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <img
                src="/sitelogo-on-dark.svg"
                alt="Loot Aura"
                className="h-6 w-auto shrink-0"
              />
              <span className="text-sm font-bold tracking-wide text-white">Loot Aura</span>
            </div>
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-[#F0B532]">
              Local Sales. Real Treasures.
            </p>
            <h2 className="mt-1.5 text-[2.5rem] font-black leading-[0.92] tracking-tight text-white">
              {cityTitleUpper}
            </h2>
            <p className="mt-0.5 text-sm font-semibold uppercase text-[#F0B532]/90">
              Weekend Sale Report
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">
              <CalendarIcon className="h-3 w-3 shrink-0 text-white/70" />
              <span>{heroDateUpper}</span>
            </div>
          </div>
          <SocialReportRankBadge rankLabel={rankLabel} cityRank={report.cityRank} size="lg" />
        </div>
      </header>

      <SocialReportMapSection report={report} format={format} />

      <section
        className="flex shrink-0 items-stretch bg-white px-8 py-3"
        style={{ height: `${definition.layoutHeightShares.metrics * 100}%` }}
      >
        <div className="flex h-full w-full gap-3">
          <PrimaryMetricCard
            value={report.activeSales.toLocaleString('en-US')}
            cityTitle={cityTitle}
            fillBand
            emphasize
          />
          <SecondaryMetricCard
            value={report.yardSales.toLocaleString('en-US')}
            label="Yard Sales"
            accentColor="#DC2626"
            iconBgClass="bg-red-600 text-white"
            icon={<TagIcon className="h-5 w-5" />}
            fillBand
          />
          <SecondaryMetricCard
            value={report.estateSales.toLocaleString('en-US')}
            label="Estate Sales"
            accentColor="#7C3AED"
            iconBgClass="bg-violet-600 text-white"
            icon={<HouseIcon className="h-5 w-5" />}
            fillBand
          />
        </div>
      </section>

      <SocialReportFooter report={report} format={format} density="compact" />
    </SocialReportCanvasFrame>
  )
}
