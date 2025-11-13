'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

// Zod schema for profile updates
const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(100, 'Display name too long'),
  avatar_url: z.string().url().optional().or(z.literal('')),
  bio: z.string().max(500, 'Bio too long').optional(),
})

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>

// Action result type
export type ActionResult<T = any> = {
  success: boolean
  data?: T
  error?: string
  fieldErrors?: Record<string, string[]>
}

// Helper function to get authenticated user
async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Authentication required')
  }
  
  return { supabase, user }
}

// Update profile action
export async function updateProfile(input: ProfileUpdateInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    // Validate input
    const validatedInput = ProfileUpdateSchema.parse(input)
    
    const { data, error } = await supabase
      .from(T.profiles)
      .upsert({
        user_id: user.id,
        display_name: validatedInput.display_name,
        avatar_url: validatedInput.avatar_url || null,
        bio: validatedInput.bio || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[ACCOUNT_ACTIONS] updateProfile error:', error)
      }
      return { success: false, error: 'We couldn\'t save your profile changes. Please try again.' }
    }

    revalidatePath('/account')
    
    return { success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        fieldErrors: Object.fromEntries(
          Object.entries(error.flatten().fieldErrors).map(([key, value]) => [
            key, 
            value || []
          ])
        )
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[ACCOUNT_ACTIONS] updateProfile exception:', error)
    }
    return { 
      success: false, 
      error: 'We couldn\'t save your profile changes. Please try again.'
    }
  }
}

// Get profile action
export async function getProfile(): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthenticatedUser()
    
    const { data, error } = await supabase
      .from(T.profiles)
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[ACCOUNT_ACTIONS] updateProfile error:', error)
      }
      return { success: false, error: 'We couldn\'t save your profile changes. Please try again.' }
    }

    return { success: true, data }
  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[ACCOUNT_ACTIONS] updateProfile exception:', error)
    }
    return { 
      success: false, 
      error: 'We couldn\'t save your profile changes. Please try again.'
    }
  }
}
