'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSchema } from './schema';

export function createSupabaseBrowserClient() {
  // Validate required environment variables
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    const error = 'NEXT_PUBLIC_SUPABASE_URL is missing';
    console.error(`[Supabase Browser] ${error}`);
    throw new Error(error);
  }

  if (!anon) {
    const error = 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing';
    console.error(`[Supabase Browser] ${error}`);
    throw new Error(error);
  }

  // Force public schema for REST access; PostgREST only exposes public/graphql_public
  return createBrowserClient(url, anon, { db: { schema: 'public' } });
}