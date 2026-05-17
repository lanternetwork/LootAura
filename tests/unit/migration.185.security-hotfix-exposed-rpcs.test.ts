import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/185_security_hotfix_exposed_rpcs.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 185 security hotfix exposed RPCs', () => {
  describe('profile RPC ownership guard', () => {
    it('requires auth.uid() = p_user_id with SQLSTATE 42501 on get_profile', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_profile(p_user_id uuid)')
      expect(sql).toMatch(/get_profile[\s\S]*auth\.uid\(\) IS NULL OR p_user_id IS DISTINCT FROM auth\.uid\(\)/)
      expect(sql).toMatch(/get_profile[\s\S]*ERRCODE = '42501'/)
    })

    it('requires auth.uid() = p_user_id with SQLSTATE 42501 on update_profile', () => {
      expect(sql).toContain(
        'CREATE OR REPLACE FUNCTION public.update_profile('
      )
      const updateProfileBlock = sql.slice(
        sql.indexOf('CREATE OR REPLACE FUNCTION public.update_profile('),
        sql.indexOf('CREATE OR REPLACE FUNCTION public.update_profile_v2(')
      )
      expect(updateProfileBlock).toMatch(
        /auth\.uid\(\) IS NULL OR p_user_id IS DISTINCT FROM auth\.uid\(\)/
      )
      expect(updateProfileBlock).toContain("ERRCODE = '42501'")
    })

    it('drops update_profile_v2 before recreate when return type differs in prod', () => {
      expect(sql).toContain(
        'DROP FUNCTION IF EXISTS public.update_profile_v2(uuid, text, text, text, text, text)'
      )
    })

    it('requires auth.uid() = p_user_id with SQLSTATE 42501 on update_profile_v2', () => {
      expect(sql).toMatch(/CREATE FUNCTION public\.update_profile_v2\(/)
      const v2Block = sql.slice(sql.indexOf('CREATE FUNCTION public.update_profile_v2('))
      expect(v2Block).toMatch(
        /auth\.uid\(\) IS NULL OR p_user_id IS DISTINCT FROM auth\.uid\(\)/
      )
      expect(v2Block).toContain("ERRCODE = '42501'")
    })
  })

  describe('profile RPC search_path and grants', () => {
    it('sets search_path to pg_catalog, lootaura_v2 on profile RPCs', () => {
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.get_profile[\s\S]*SET search_path = pg_catalog, lootaura_v2/
      )
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.update_profile\([\s\S]*SET search_path = pg_catalog, lootaura_v2/
      )
      expect(sql).toMatch(
        /CREATE FUNCTION public\.update_profile_v2\([\s\S]*SET search_path = pg_catalog, lootaura_v2/
      )
    })

    it('revokes EXECUTE from PUBLIC and anon on profile RPCs', () => {
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_profile(uuid) FROM PUBLIC')
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_profile(uuid) FROM anon')
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) FROM anon'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) FROM PUBLIC'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) FROM anon'
      )
    })

    it('grants EXECUTE to authenticated only on profile RPCs', () => {
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_profile(uuid) TO authenticated')
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) TO authenticated'
      )
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) TO authenticated'
      )
      expect(sql).not.toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_profile\(uuid\)\s+TO\s+anon\b/i
      )
    })
  })

  describe('ingestion claim RPC grants', () => {
    const claimFunctions = [
      'claim_ingested_sales_for_geocoding(integer, integer)',
      'claim_ingested_sales_for_address_enrichment(integer, integer)',
      'claim_ingested_sales_for_image_enrichment(integer, integer)',
      'claim_ingested_sales_for_publish(integer)',
    ] as const

    it.each(claimFunctions)('revokes PUBLIC, anon, authenticated from %s', (fn) => {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION lootaura_v2.${fn} FROM PUBLIC`)
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION lootaura_v2.${fn} FROM anon`)
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION lootaura_v2.${fn} FROM authenticated`)
    })

    it.each(claimFunctions)('grants service_role only on %s', (fn) => {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION lootaura_v2.${fn} TO service_role`)
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION lootaura_v2.${fn} TO authenticated`)
    })

    it.each(claimFunctions)('hardens search_path without public on %s', (fn) => {
      expect(sql).toContain(`ALTER FUNCTION lootaura_v2.${fn}`)
      expect(sql).toContain('SET search_path = lootaura_v2, pg_catalog')
    })
  })

  describe('cleanup_old_analytics_events', () => {
    it('revokes broad execute and grants service_role only', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM PUBLIC'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM anon'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM authenticated'
      )
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() TO service_role'
      )
    })

    it('hardens search_path on cleanup_old_analytics_events', () => {
      expect(sql).toContain('ALTER FUNCTION lootaura_v2.cleanup_old_analytics_events()')
      expect(sql).toMatch(
        /cleanup_old_analytics_events\(\)[\s\S]*SET search_path = lootaura_v2, pg_catalog/
      )
    })
  })

  describe('verification comments', () => {
    it('documents post-apply grant verification queries', () => {
      expect(sql).toContain("grantee IN ('PUBLIC', 'anon')")
      expect(sql).toContain("'get_profile', 'update_profile', 'update_profile_v2'")
      expect(sql).toContain("'claim_ingested_sales_for_geocoding'")
      expect(sql).toContain("'cleanup_old_analytics_events'")
    })
  })
})
