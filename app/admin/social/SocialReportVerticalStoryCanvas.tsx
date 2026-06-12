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

type SocialReportVerticalStoryCanvasProps = {
  report: SocialCityReport
  onMapIdle?: () => void
}

/** Vertical story canvas — 1080×1920 (9:16). */
export default function SocialReportVerticalStoryCanvas({
  report,
  onMapIdle,
}: SocialReportVerticalStoryCanvasProps) {
  const format = 'vertical-story' as const
  const definition = getSocialReportFormat(format)
  const cityTitle = `${report.city}, ${report.state}`
  const cityTitleUpper = `${report.city.toUpperCase()}, ${report.state}`
  const rankLabel = report.cityRank != null ? `#${report.cityRank}` : 'N/A'
  const heroDateUpper = formatHeroDateUpper(report.heroDateRange)

  return (
    <SocialReportCanvasFrame format={format}>
      <header
        className="relative flex shrink-0 flex-col justify-center bg-gradient-to-r from-[#0c1628] via-[#12243d] to-[#16263e] px-8 py-6"
        style={{ height: `${definition.layoutHeightShares.header * 100}%` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <img src="/sitelogo-on-dark.svg" alt="Loot Aura" className="h-9 w-auto shrink-0" />
              <span className="text-lg font-bold tracking-wide text-white">Loot Aura</span>
            </div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#F0B532]">
              Local Sales. Real Treasures.
            </p>
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#F0B532]/70 bg-[#0a1220]/90 px-3 py-1.5"
            aria-hidden="true"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              {cityTitleUpper}
            </span>
            <ChevronDownIcon className="h-3 w-3 text-[#F0B532]" />
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[3rem] font-black leading-[0.95] tracking-tight text-white">
              {cityTitleUpper}
            </h2>
            <p className="mt-2 text-2xl font-semibold uppercase text-[#F0B532]">
              Weekend Sale Report
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-white/90">
              <CalendarIcon className="h-4 w-4 shrink-0 text-white/80" />
              <span>{heroDateUpper}</span>
            </div>
          </div>
          <SocialReportRankBadge rankLabel={rankLabel} cityRank={report.cityRank} size="lg" />
        </div>
      </header>

      <SocialReportMapSection report={report} format={format} onMapIdle={onMapIdle} />

      <section
        className="flex shrink-0 flex-col justify-center gap-3 bg-white px-8"
        style={{ height: `${definition.layoutHeightShares.metrics * 100}%` }}
      >
        <PrimaryMetricCard
          value={report.activeSales.toLocaleString('en-US')}
          cityTitle={cityTitle}
        />
        <div className="flex gap-3">
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
        </div>
      </section>

      <SocialReportFooter report={report} format={format} />
    </SocialReportCanvasFrame>
  )
}
