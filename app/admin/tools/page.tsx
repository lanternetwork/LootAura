import { requireAdminToolsAccess } from '@/lib/auth/adminGate'
import AdminToolsPageClient from './AdminToolsPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminToolsPage() {
  // Server-side gate: require admin access (lanternetwork@gmail.com)
  await requireAdminToolsAccess()

  // If we get here, user is authenticated and is the admin
  return <AdminToolsPageClient />
}
