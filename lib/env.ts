import { z } from 'zod'

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, 'NEXT_PUBLIC_SUPABASE_ANON_KEY must be at least 10 characters'),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (val) => {
      // Handle empty strings, whitespace, or invalid values during build
      if (!val || typeof val !== 'string' || val.trim() === '') {
        return undefined
      }
      // If it's a valid URL string, return it; otherwise return undefined to allow optional
      try {
        new URL(val)
        return val
      } catch {
        return undefined
      }
    },
    z.string().url().optional()
  ),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (val) => {
      if (!val || typeof val !== 'string' || val.trim() === '') {
        return undefined
      }
      try {
        new URL(val)
        return val
      } catch {
        return undefined
      }
    },
    z.string().url().optional()
  ),
  NEXT_PUBLIC_SUPABASE_SCHEMA: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_ENABLED: z.string().optional(),
  NEXT_PUBLIC_DEBUG: z.preprocess(
    (val) => val === 'true' || val === '1',
    z.boolean().optional()
  ),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().optional(),
  NEXT_PUBLIC_MAX_UPLOAD_SIZE: z.preprocess(
    (val) => val ? parseInt(String(val), 10) : undefined,
    z.number().int().positive().optional()
  ),
  NEXT_PUBLIC_CLARITY_ID: z.preprocess(
    (val) => {
      // In production, require Clarity ID; in dev, allow optional
      if (process.env.NODE_ENV === 'production' && (!val || typeof val !== 'string' || val.trim() === '')) {
        // Don't throw - just return undefined so it's optional even in production
        // This allows gradual rollout
        return undefined
      }
      return val && typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined
    },
    z.string().min(1).optional()
  ),
  NEXT_PUBLIC_ENABLE_ADSENSE: z.preprocess(
    (val) => val === 'true' || val === '1',
    z.boolean().optional()
  ),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  // For HTML file method: filename like "google1234567890.html"
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_FILE: z.string().optional(),
  // Stripe publishable key (client-side)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE: z.string().min(10, 'SUPABASE_SERVICE_ROLE must be at least 10 characters'),
  VAPID_PRIVATE_KEY: z.string().min(10).optional(),
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url().optional()
  ),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
  MAX_UPLOAD_SIZE_BYTES: z.preprocess(
    (val) => val ? parseInt(String(val), 10) : undefined,
    z.number().int().positive().optional()
  ),
  NOMINATIM_APP_EMAIL: z.preprocess(
    (val) => {
      // In production, require email; in dev, allow optional with default
      if (process.env.NODE_ENV === 'production' && (!val || typeof val !== 'string' || val.trim() === '')) {
        throw new Error('NOMINATIM_APP_EMAIL is required in production')
      }
      return val || 'admin@lootaura.com'
    },
    z.string().email()
  ),
  // Stripe configuration (optional - only required when PAYMENTS_ENABLED=true)
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  STRIPE_PRICE_ID_FEATURED_WEEK: z.string().optional(),
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
  NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  NEXT_PUBLIC_MAX_UPLOAD_SIZE: process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE,
  NEXT_PUBLIC_CLARITY_ID: process.env.NEXT_PUBLIC_CLARITY_ID,
  NEXT_PUBLIC_ENABLE_ADSENSE: process.env.NEXT_PUBLIC_ENABLE_ADSENSE,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_FILE: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_FILE,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
})

// Validate server environment variables (only in server context, lazy to avoid build-time validation)
let _ENV_SERVER: z.infer<typeof serverSchema> | null = null

function getEnvServer() {
  // In test environment, always re-parse to pick up env changes
  if (process.env.NODE_ENV === 'test' || !_ENV_SERVER) {
    _ENV_SERVER = serverSchema.parse({
      SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      MAX_UPLOAD_SIZE_BYTES: process.env.MAX_UPLOAD_SIZE_BYTES,
      NOMINATIM_APP_EMAIL: process.env.NOMINATIM_APP_EMAIL,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_ID_FEATURED_WEEK: process.env.STRIPE_PRICE_ID_FEATURED_WEEK,
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

// Getter for Nominatim email (single source of truth)
export function getNominatimEmail(): string {
  return getEnvServer().NOMINATIM_APP_EMAIL
}

// Helper to check if we're in production
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// Helper to check if debug mode is enabled
export function isDebugMode(): boolean {
  return ENV_PUBLIC.NEXT_PUBLIC_DEBUG === true
}

// Helper to check if AdSense is enabled
export const ADSENSE_ENABLED = ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE === true