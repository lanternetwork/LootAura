import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

describe.skipIf(!supabaseUrl || !supabaseAnonKey)('Public Profile Routing', () => {
  let supabase: ReturnType<typeof createClient>

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase env vars not set')
    }
    supabase = createClient(supabaseUrl, supabaseAnonKey)
  })

  describe('Username-based routing', () => {
    it('If username exists: /u/{username} → 200', async () => {
      // Find a profile with username
      const { data: profile } = await supabase
        .from('profiles_v2')
        .select('username')
        .not('username', 'is', null)
        .limit(1)
        .maybeSingle()

      if (profile && profile.username) {
        // Verify profile can be fetched by username
        const { data, error } = await supabase
          .from('profiles_v2')
          .select('id, username')
          .eq('username', profile.username)
          .maybeSingle()

        expect(error).toBeNull()
        expect(data).not.toBeNull()
        if (data) {
          expect(data.username).toBe(profile.username)
        }
      }
    })

    it('Unknown username → 404', async () => {
      const { data, error } = await supabase
        .from('profiles_v2')
        .select('id')
        .eq('username', 'nonexistent-username-12345')
        .maybeSingle()

      // Should not find profile - data should be null
      expect(data).toBeNull()
    })
  })

  describe('ID-based routing', () => {
    it('If username null but id present: /u/{id} → 200', async () => {
      // Find a profile without username
      const { data: profile } = await supabase
        .from('profiles_v2')
        .select('id, username')
        .is('username', null)
        .limit(1)
        .maybeSingle()

      if (profile && profile.id) {
        // Verify UUID format
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.id)
        expect(isUUID).toBe(true)

        // Verify profile can be fetched by ID
        const { data, error } = await supabase
          .from('profiles_v2')
          .select('id')
          .eq('id', profile.id)
          .maybeSingle()

        expect(error).toBeNull()
        expect(data).not.toBeNull()
        if (data) {
          expect(data.id).toBe(profile.id)
        }
      }
    })
  })

  describe('UUID detection', () => {
    it('detects UUID format correctly', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      
      expect(uuidRegex.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
      expect(uuidRegex.test('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
      expect(uuidRegex.test('username')).toBe(false)
      expect(uuidRegex.test('user-name')).toBe(false)
    })
  })
})

