import { requireAdminToolsAccess } from '@/lib/auth/adminGate'
import IngestionDashboardClient from './IngestionDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminIngestionPage() {
  await requireAdminToolsAccess('/admin/ingestion')
  return <IngestionDashboardClient />
}
