/**
 * Shortlink redirect page
 * Resolves /s/<id> to canonical URL with serialized state
 */

import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { serializeState } from '@/lib/url/state'
import { getAdminDb } from '@/lib/supabase/clients'
import { Policies } from '@/lib/rateLimit/policies'
import { shouldBypassRateLimit } from '@/lib/rateLimit/config'
import { deriveKey } from '@/lib/rateLimit/keys'
import { check } from '@/lib/rateLimit/limiter'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ShortlinkPage({ params }: PageProps) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    notFound()
  }

  try {
    if (!shouldBypassRateLimit()) {
      const headerStore = await headers()
      const req = new Request(`http://localhost/s/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: headerStore,
      })
      const policies = [Policies.SALES_VIEW_30S, Policies.SALES_VIEW_HOURLY]
      for (const policy of policies) {
        const key = await deriveKey(req, policy.scope)
        const result = await check(policy, key)
        if (!result.allowed) {
          notFound()
        }
      }
    }

    const { data, error } = await getAdminDb()
      .from('shared_states')
      .select('state_json')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Failed to retrieve shared state:', error)
      notFound()
    }

    // Check if data exists and has state_json field
    if (!data || !data.state_json) {
      console.error('Shared state missing or missing state_json field')
      notFound()
    }

    // Serialize state to URL query string
    const queryString = serializeState(data.state_json)
    
    // Redirect to explore page with serialized state
    redirect(`/explore?${queryString}`)
  } catch (error) {
    console.error('Shortlink resolution error:', error)
    notFound()
  }
}
