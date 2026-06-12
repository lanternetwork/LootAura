import type { SocialReportFormatSlug } from '@/lib/admin/social/socialReportFormats'
import type { SocialCityReport } from '@/lib/admin/social/socialCityReportTypes'
import SocialReportInstagramFeedCanvas from './SocialReportInstagramFeedCanvas'
import SocialReportVerticalStoryCanvas from './SocialReportVerticalStoryCanvas'

type SocialReportCanvasProps = {
  report: SocialCityReport
  format: SocialReportFormatSlug
  onMapIdle?: () => void
}

/** Routes to the format-specific screenshot canvas layout. */
export default function SocialReportCanvas({ report, format, onMapIdle }: SocialReportCanvasProps) {
  if (format === 'vertical-story') {
    return <SocialReportVerticalStoryCanvas report={report} onMapIdle={onMapIdle} />
  }
  return <SocialReportInstagramFeedCanvas report={report} onMapIdle={onMapIdle} />
}
