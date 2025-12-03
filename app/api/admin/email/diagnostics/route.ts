/**
 * GET /api/admin/email/diagnostics
 * Admin endpoint for email system diagnostics
 * Server-only route
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

interface EmailDiagnostics {
  configuration: {
    emailsEnabled: boolean
    resendApiKeyPresent: boolean
    resendFromEmail: string | null
    emailFrom: string | null
    cronSecretPresent: boolean
    siteUrl: string | null
  }
  featureFlags: {
    favoriteSaleStartingSoonEnabled: boolean
    favoriteSaleStartingSoonHoursBeforeStart: number
    sellerWeeklyAnalyticsEnabled: boolean
  }
  environment: {
    nodeEnv: string
    isProduction: boolean
  }
}

/**
 * GET /api/admin/email/diagnostics
 * Get email system diagnostics
 * 
 * Only accessible to admins
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin access
    await assertAdminOrThrow(request)

    // Check configuration (server-side env vars)
    const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
    const resendApiKeyPresent = !!process.env.RESEND_API_KEY
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || null
    const emailFrom = process.env.EMAIL_FROM || null
    const cronSecretPresent = !!process.env.CRON_SECRET
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || null

    // Get feature flags (dynamically import to get current values)
    let favoriteSaleStartingSoonEnabled = true
    let favoriteSaleStartingSoonHoursBeforeStart = 24
    let sellerWeeklyAnalyticsEnabled = true

    try {
      const emailConfig = await import('@/lib/config/email')
      favoriteSaleStartingSoonEnabled = emailConfig.FAVORITE_SALE_STARTING_SOON_ENABLED
      favoriteSaleStartingSoonHoursBeforeStart = emailConfig.FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START
      sellerWeeklyAnalyticsEnabled = emailConfig.getSellerWeeklyAnalyticsEnabled()
    } catch {
      // Config module not available - use defaults
    }

    const diagnostics: EmailDiagnostics = {
      configuration: {
        emailsEnabled,
        resendApiKeyPresent,
        resendFromEmail,
        emailFrom,
        cronSecretPresent,
        siteUrl,
      },
      featureFlags: {
        favoriteSaleStartingSoonEnabled,
        favoriteSaleStartingSoonHoursBeforeStart,
        sellerWeeklyAnalyticsEnabled,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
      },
    }

    return NextResponse.json({
      ok: true,
      diagnostics,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // If it's an auth error, return 403
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('Forbidden')) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', message: errorMessage },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { ok: false, error: 'Internal server error', message: errorMessage },
      { status: 500 }
    )
  }
}

