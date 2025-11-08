/**
 * Shortlink redirect page
 * Resolves /s/<id> to canonical URL with serialized state
 */

import { notFound, redirect } from 'next/navigation'
import { serializeState } from '@/lib/url/state'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface PageProps {
  params: {
    id: string
  }
}

export default async function ShortlinkPage({ params }: PageProps) {
  const { id } = params

  if (!id || typeof id !== 'string') {
    notFound()
  }

  try {
    const supabase = createSupabaseServerClient()

    if (!supabase) {
      console.error('Failed to create Supabase client')
      notFound()
    }

    // Retrieve shared state from database
    const { data, error } = await supabase
      .from('shared_states')
      .select('state_json')
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error('Failed to retrieve shared state:', error)
      notFound()
    }

    if (!data.state_json) {
      console.error('Shared state missing state_json field')
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
