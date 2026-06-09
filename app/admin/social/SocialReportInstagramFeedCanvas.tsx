import { getSocialReportFormat } from '@/lib/admin/social/socialReportFormats'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import {
  CalendarIcon,
  ChevronDownIcon,
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
        className="relative flex shrink-0 items-center bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-8 py-5"
        style={{ height: `${definition.layoutHeightShares.header * 100}%` }}
      >
        <div className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <img
                    src="/sitelogo-on-dark.svg"
                    alt="Loot Aura"
                    className="h-8 w-auto shrink-0"
                  />
                  <span className="text-base font-bold tracking-wide text-white">Loot Aura</span>
                </div>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#F0B532]">
                  Local Sales. Real Treasures.
                </p>
              </div>
              <div
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#F0B532]/70 bg-[#0a1220]/90 px-3 py-1"
                aria-hidden="true"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                  {cityTitleUpper}
                </span>
                <ChevronDownIcon className="h-3 w-3 text-[#F0B532]" />
              </div>
            </div>
            <h2 className="mt-2 text-[2.5rem] font-black leading-[0.95] tracking-tight text-white">
              {cityTitleUpper}
            </h2>
            <p className="mt-1.5 text-xl font-semibold uppercase text-[#F0B532]">
              Weekend Sale Report
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/90">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-white/80" />
              <span>{heroDateUpper}</span>
            </div>
          </div>
          <SocialReportRankBadge rankLabel={rankLabel} cityRank={report.cityRank} />
        </div>
      </header>

      <SocialReportMapSection report={report} format={format} />

      <section
        className="flex shrink-0 items-center bg-white px-6"
        style={{ height: `${definition.layoutHeightShares.metrics * 100}%` }}
      >
        <div className="flex w-full gap-3">
          <PrimaryMetricCard
            value={report.activeSales.toLocaleString('en-US')}
            cityTitle={cityTitle}
            compact
          />
          <SecondaryMetricCard
            value={report.yardSales.toLocaleString('en-US')}
            label="Yard Sales"
            accentColor="#DC2626"
            iconBgClass="bg-red-600 text-white"
            icon={<TagIcon className="h-4 w-4" />}
            compact
          />
          <SecondaryMetricCard
            value={report.estateSales.toLocaleString('en-US')}
            label="Estate Sales"
            accentColor="#7C3AED"
            iconBgClass="bg-violet-600 text-white"
            icon={<HouseIcon className="h-4 w-4" />}
            compact
          />
        </div>
      </section>

      <SocialReportFooter report={report} format={format} />
    </SocialReportCanvasFrame>
  )
}
