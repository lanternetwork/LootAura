import { requireAdminToolsAccess } from '@/lib/auth/adminGate'
import IngestionDashboardV2Client from './IngestionDashboardV2Client'

export const dynamic = 'force-dynamic'

export default async function AdminIngestionV2Page() {
  await requireAdminToolsAccess('/admin/ingestion/v2')
  return <IngestionDashboardV2Client />
}
