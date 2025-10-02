import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSchema } from './schema';

// Log schema at server startup (once)
let schemaLogged = false;
function logSchemaOnce() {
  if (!schemaLogged) {
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

  const schema = getSchema();
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
    db: { schema: 'public' }, // Force public schema
  });
}