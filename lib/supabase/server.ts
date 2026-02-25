import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSchema } from './schema';

// Log schema at server startup (once)
let schemaLogged = false;
function logSchemaOnce() {
  if (!schemaLogged && process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const schema = getSchema();
    console.log(`[Supabase] Using schema: ${schema}`);
    schemaLogged = true;
  }
}

export function createSupabaseServerClient() {
  // Validate required environment variables
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    const error = 'NEXT_PUBLIC_SUPABASE_URL is missing';
    console.error(`[Supabase Server] ${error}`);
    throw new Error(error);
  }

  if (!anon) {
    const error = 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing';
    console.error(`[Supabase Server] ${error}`);
    throw new Error(error);
  }

  // Log schema once at startup
  logSchemaOnce();

  const _schema = getSchema();
  const cookieStore = cookies()

  // This client is intended for Server Components and must not write cookies.
  // Mutations and session refresh belong in Route Handlers / API routes.
  // Disable auto-refresh and session persistence to prevent cookie writes during SSR.
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' }, // Use public schema for reading views (sales_v2, items_v2)
  });
}

/**
 * Create Supabase client for writing to base tables
 * Note: PostgREST only supports 'public' and 'graphql_public' schemas in client config
 * Tables in lootaura_v2 schema must be accessed through views in public schema
 */
export function createSupabaseWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Supabase credentials missing');
  }

  const cookieStore = cookies()

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
    db: { schema: 'public' }, // PostgREST only supports public/graphql_public schemas
  });
}