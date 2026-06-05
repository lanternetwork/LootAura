import { requireAdminToolsAccess } from '@/lib/auth/adminGate'
import SeoOperationsDashboardClient from './SeoOperationsDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminSeoOperationsPage() {
  await requireAdminToolsAccess('/admin/seo')
  return <SeoOperationsDashboardClient />
}
