import { z } from 'zod'

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, 'NEXT_PUBLIC_SUPABASE_ANON_KEY must be at least 10 characters'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_SCHEMA: z.string().optional(),
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().min(10).optional(),
  NEXT_PUBLIC_DEBUG: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_FEATURE_CLUSTERING: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_FLAG_OFFLINE_CACHE: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_FLAG_SAVED_PRESETS: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_FLAG_SHARE_LINKS: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_GOOGLE_ENABLED: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_MAX_UPLOAD_SIZE: z.string().regex(/^\d+$/).optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().min(1).optional(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE: z.string().min(10, 'SUPABASE_SERVICE_ROLE must be at least 10 characters'),
  VAPID_PRIVATE_KEY: z.string().min(10).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
  NOMINATIM_APP_EMAIL: z.string().email().optional(),
  MAPBOX_GEOCODING_ENDPOINT: z.string().url().optional(),
})

// Validate public environment variables
export const ENV_PUBLIC = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SUPABASE_SCHEMA: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA,
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
  NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG,
  NEXT_PUBLIC_FEATURE_CLUSTERING: process.env.NEXT_PUBLIC_FEATURE_CLUSTERING,
  NEXT_PUBLIC_FLAG_OFFLINE_CACHE: process.env.NEXT_PUBLIC_FLAG_OFFLINE_CACHE,
  NEXT_PUBLIC_FLAG_SAVED_PRESETS: process.env.NEXT_PUBLIC_FLAG_SAVED_PRESETS,
  NEXT_PUBLIC_FLAG_SHARE_LINKS: process.env.NEXT_PUBLIC_FLAG_SHARE_LINKS,
  NEXT_PUBLIC_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_ENABLED,
  NEXT_PUBLIC_MAX_UPLOAD_SIZE: process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
})

// Validate server environment variables (only in server context)
export const ENV_SERVER = serverSchema.parse({
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  NOMINATIM_APP_EMAIL: process.env.NOMINATIM_APP_EMAIL,
  MAPBOX_GEOCODING_ENDPOINT: process.env.MAPBOX_GEOCODING_ENDPOINT,
})

// Type exports for better TypeScript support
export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>
