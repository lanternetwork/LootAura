/**
 * Rate Limiting Policies
 * 
 * Defines named policies for different endpoint categories.
 * No magic numbers in routes - all limits defined here.
 */

export type Policy = {
  name: string
  limit: number
  windowSec: number
  burstSoft?: number      // number of soft-allowed overages
  softWindowSec?: number  // soft window for grace
  scope: 'ip' | 'user' | 'ip-auth' // ip-auth: force IP for auth routes
}

export const Policies = {
  AUTH_DEFAULT:      { name: 'AUTH_DEFAULT',      limit: 5,  windowSec: 30, scope: 'ip' as const },
  AUTH_HOURLY:       { name: 'AUTH_HOURLY',       limit: 60, windowSec: 3600, scope: 'ip' as const },
  AUTH_CALLBACK:     { name: 'AUTH_CALLBACK',     limit: 10, windowSec: 60, scope: 'ip' as const }, // tiny burst
  GEO_ZIP_SHORT:     { name: 'GEO_ZIP_SHORT',     limit: 10, windowSec: 60, scope: 'ip' as const },
  GEO_ZIP_HOURLY:    { name: 'GEO_ZIP_HOURLY',    limit: 300, windowSec: 3600, scope: 'ip' as const },
  GEO_SUGGEST_SHORT: { name: 'GEO_SUGGEST_SHORT', limit: 60, windowSec: 60, scope: 'ip' as const },
  GEO_REVERSE_SHORT: { name: 'GEO_REVERSE_SHORT', limit: 10, windowSec: 60, scope: 'ip' as const },
  GEO_OVERPASS_SHORT: { name: 'GEO_OVERPASS_SHORT', limit: 30, windowSec: 60, scope: 'ip' as const },
  SALES_VIEW_30S:    { name: 'SALES_VIEW_30S',    limit: 20, windowSec: 30, burstSoft: 2, softWindowSec: 5, scope: 'ip' as const },
  SALES_VIEW_HOURLY: { name: 'SALES_VIEW_HOURLY', limit: 800, windowSec: 3600, scope: 'ip' as const },
  MUTATE_MINUTE:     { name: 'MUTATE_MINUTE',     limit: 3,  windowSec: 60, scope: 'user' as const },
  MUTATE_DAILY:      { name: 'MUTATE_DAILY',      limit: 100, windowSec: 86400, scope: 'user' as const },
  DRAFT_AUTOSAVE_MINUTE: { name: 'DRAFT_AUTOSAVE_MINUTE', limit: 10, windowSec: 60, scope: 'user' as const },
  RATING_MINUTE:     { name: 'RATING_MINUTE',     limit: 10, windowSec: 60, scope: 'user' as const },
  RATING_HOURLY:      { name: 'RATING_HOURLY',    limit: 50, windowSec: 3600, scope: 'user' as const },
  ADMIN_TOOLS:       { name: 'ADMIN_TOOLS',       limit: 3,  windowSec: 30, scope: 'ip' as const },
  ADMIN_HOURLY:      { name: 'ADMIN_HOURLY',      limit: 60, windowSec: 3600, scope: 'ip' as const },
  UNSUBSCRIBE_EMAIL: { name: 'UNSUBSCRIBE_EMAIL', limit: 5,  windowSec: 900, scope: 'ip' as const }, // 5 requests per 15 minutes
  REPORT_SALE:       { name: 'REPORT_SALE',       limit: 5,  windowSec: 3600, scope: 'user' as const }, // 5 reports per hour per user
} as const

export type PolicyName = keyof typeof Policies
