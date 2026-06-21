import { buildSaleInstanceShadowReplayReport } from '@/lib/ingestion/ystmCoverage/buildSaleInstanceShadowReplayReport'
import { listMissingValidObservations } from '@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport'
import { getAdminDb } from '@/lib/supabase/clients'

export async function runAdminShadowReplay(now: Date = new Date()) {
  const admin = getAdminDb()
  const missingRows = await listMissingValidObservations(admin)
  const report = await buildSaleInstanceShadowReplayReport(admin, missingRows, now)
  return report
}
