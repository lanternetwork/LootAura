import { createSupabaseServerClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Let middleware handle redirect if configured; otherwise simple message
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold">Please sign in</h1>
        <p className="text-gray-600 mt-2">You need to be authenticated to access the dashboard.</p>
      </div>
    )
  }

  // Fetch all sales for the user (including published, draft, etc.)
  // Since the API endpoint works but direct query doesn't, use the API endpoint
  // This ensures consistent authentication and RLS behavior
  let listings: Array<{ id: string; title: string; updated_at?: string | null; status?: string | null; cover_image_url?: string | null }> = []
  
  try {
    // Get the auth token to pass to the API
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    
    // Call the working API endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'
    
    const apiUrl = `${baseUrl}/api/sales_v2?my_sales=true`
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Cookie': '', // Pass cookies through
      },
      cache: 'no-store',
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.sales && Array.isArray(data.sales)) {
        listings = data.sales.map((sale: any) => ({
          id: sale.id,
          title: sale.title,
          updated_at: sale.updated_at,
          status: sale.status,
          cover_image_url: sale.cover_image_url,
        }))
        console.log('[DASHBOARD] Fetched', listings.length, 'sales via API endpoint')
      }
    } else {
      console.error('[DASHBOARD] API endpoint returned error:', response.status, response.statusText)
    }
  } catch (error) {
    console.error('[DASHBOARD] Error calling API endpoint:', error)
    // Fallback: try direct query
    const { data: directListings } = await supabase
      .from('sales_v2')
      .select('id, title, updated_at, status, cover_image_url')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    
    if (directListings) {
      listings = directListings
      console.log('[DASHBOARD] Fallback: Found', listings.length, 'sales via direct query')
    }
  }

  return (
    <DashboardClient initialListings={listings ?? []} />
  )
}


