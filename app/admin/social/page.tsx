import { requireAdminToolsAccess } from '@/lib/auth/adminGate'
import SocialCityReportClient from './SocialCityReportClient'

export const dynamic = 'force-dynamic'

export default async function AdminSocialCityReportPage() {
  await requireAdminToolsAccess('/admin/social')
  return <SocialCityReportClient />
}
