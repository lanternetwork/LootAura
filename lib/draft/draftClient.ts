/**
 * Client-side draft API helpers
 * Wraps the draft API routes for easy use in components
 */

import { SaleDraftPayload } from '@/lib/validation/saleDraft'
import { getCsrfHeaders } from '@/lib/csrf-client'

type ApiResponse<T = any> = {
  ok: boolean
  data?: T
  error?: string
  code?: string
  details?: string
}

/**
 * Save draft to server (for authenticated users)
 */
export async function saveDraftServer(
  payload: SaleDraftPayload,
  draftKey: string
): Promise<ApiResponse<{ id: string }>> {
  try {
    const response = await fetch('/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ payload, draftKey }),
    })

    if (!response.ok) {
      // Try to parse error response
      let errorData: any = {}
      try {
        errorData = await response.json()
      } catch {
        // If JSON parsing fails, use status text
        errorData = { error: response.statusText || 'Failed to save draft' }
      }
      
      console.error('[DRAFT_CLIENT] Save failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
        code: errorData.code,
        details: errorData.details
      })
      
      return {
        ok: false,
        error: errorData.error || `Failed to save draft (${response.status})`,
        code: errorData.code || 'SAVE_ERROR',
        details: errorData.details
      }
    }

    const result = await response.json()
    
    // Dispatch event to notify dashboard to refresh drafts
    if (result.ok && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drafts:mutated', { 
        detail: { type: 'update', draftKey } 
      }))
    }
    
    return result
  } catch (error) {
    console.error('[DRAFT_CLIENT] Error saving draft:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save draft',
      code: 'NETWORK_ERROR'
    }
  }
}

/**
 * Get latest draft from server (for authenticated users)
 */
export async function getLatestDraftServer(): Promise<ApiResponse<{ id: string; draft_key: string; payload: SaleDraftPayload } | null>> {
  try {
    const response = await fetch('/api/drafts', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('[DRAFT_CLIENT] Error fetching draft:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch draft',
      code: 'NETWORK_ERROR'
    }
  }
}

/**
 * Delete draft from server (for authenticated users)
 */
export async function deleteDraftServer(draftKey: string): Promise<ApiResponse<{}>> {
  try {
    const response = await fetch(`/api/drafts?draftKey=${encodeURIComponent(draftKey)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      credentials: 'include',
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('[DRAFT_CLIENT] Error deleting draft:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to delete draft',
      code: 'NETWORK_ERROR'
    }
  }
}

/**
 * Publish draft (transactional: create sale + items, mark draft as published)
 * If wantsPromotion is true, creates sale as draft first (client must validate checkout and publish separately)
 */
export async function publishDraftServer(draftKey: string, wantsPromotion?: boolean): Promise<ApiResponse<{ saleId: string }>> {
  try {
    const response = await fetch('/api/drafts/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ draftKey, wantsPromotion: wantsPromotion || false }),
    })

    if (!response.ok) {
      // Try to parse error response
      let errorData: any = {}
      try {
        errorData = await response.json()
      } catch {
        // If JSON parsing fails, use status text
        errorData = { error: response.statusText || 'Failed to publish draft' }
      }
      
      console.error('[DRAFT_CLIENT] Publish failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
        code: errorData.code,
        details: errorData.details,
        hint: errorData.hint
      })
      
      return {
        ok: false,
        error: errorData.error || `Failed to publish draft (${response.status})`,
        code: errorData.code || 'PUBLISH_ERROR'
      }
    }

    const result = await response.json()
    return result
  } catch (error) {
    console.error('[DRAFT_CLIENT] Error publishing draft:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to publish draft',
      code: 'NETWORK_ERROR'
    }
  }
}

