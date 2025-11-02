import { z } from 'zod'

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, 'NEXT_PUBLIC_SUPABASE_ANON_KEY must be at least 10 characters'),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url().optional()
  ),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url().optional()
  ),
  NEXT_PUBLIC_SUPABASE_SCHEMA: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_ENABLED: z.string().optional(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE: z.string().min(10, 'SUPABASE_SERVICE_ROLE must be at least 10 characters'),
  VAPID_PRIVATE_KEY: z.string().min(10).optional(),
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url().optional()
  ),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
  NOMINATIM_APP_EMAIL: z.string().email().optional(),
})

// Validate public environment variables
export const ENV_PUBLIC = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SUPABASE_SCHEMA: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA,
  NEXT_PUBLIC_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_ENABLED,
})

// Validate server environment variables (only in server context, lazy to avoid build-time validation)
let _ENV_SERVER: z.infer<typeof serverSchema> | null = null

function getEnvServer() {
  if (!_ENV_SERVER) {
    _ENV_SERVER = serverSchema.parse({
      SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      NOMINATIM_APP_EMAIL: process.env.NOMINATIM_APP_EMAIL,
    })
  }
  return _ENV_SERVER
}

// Use Proxy to make ENV_SERVER appear as a normal object but validate lazily
export const ENV_SERVER = new Proxy({} as z.infer<typeof serverSchema>, {
  get(_target, prop) {
    return getEnvServer()[prop as keyof z.infer<typeof serverSchema>]
  }
})

// Type exports for better TypeScript support
export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>
