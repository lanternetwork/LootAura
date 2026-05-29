/**
 * Parse Supabase auth tokens from URL hash or query (client-safe).
 */

export type ParsedAuthTokens = {
  access_token: string
  refresh_token: string
  type?: string
}

export function parseAuthTokensFromHash(hash: string): ParsedAuthTokens | null {
  if (!hash || hash === '#') return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null
  const type = params.get('type') ?? undefined
  return { access_token, refresh_token, type }
}

export function parseAuthTokensFromSearch(search: string): ParsedAuthTokens | null {
  if (!search) return null
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null
  const type = params.get('type') ?? undefined
  return { access_token, refresh_token, type }
}
