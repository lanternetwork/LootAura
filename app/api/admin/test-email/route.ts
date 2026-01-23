/**
 * Admin test email endpoint
 * Allows testing email sending in non-production environments
 * Server-only route
 */

import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { sendEmail } from '@/lib/email/sendEmail'
import { SaleCreatedConfirmationEmail, getSaleCreatedSubject } from '@/lib/email/templates/SaleCreatedConfirmationEmail'
import { sendFavoriteSalesStartingSoonDigestEmail } from '@/lib/email/favorites'
import { sendSellerWeeklyAnalyticsEmail } from '@/lib/email/sellerAnalytics'
import type { Sale } from '@/lib/types'
import type { SellerWeeklyAnalytics } from '@/lib/data/sellerAnalytics'

export const dynamic = 'force-dynamic'

const TestEmailBodySchema = z.object({
  to: z.string().email('Invalid email address format').max(320, 'Email address too long'),
  emailType: z.enum(['sale_created', 'favorites_digest', 'seller_weekly']).default('sale_created'),
})

/**
 * POST /api/admin/test-email
 * Send a test email of the specified type
 * 
 * Body: { to: string, emailType?: 'sale_created' | 'favorites_digest' | 'seller_weekly' }
 * 
 * Only accessible to admins (debug-mode bypass is controlled in adminGate)
 */
export async function POST(request: NextRequest) {
  // Hard-disable in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    )
  }

  try {
    // Require admin access in all environments
    try {
      await assertAdminOrThrow(request)
    } catch {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // Require ENABLE_ADMIN_TOOLS flag (allow in debug mode for development/preview)
    const isDebugMode = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'
    const adminToolsValue = process.env.ENABLE_ADMIN_TOOLS?.trim().toLowerCase()
    const isExplicitlyDisabled = adminToolsValue === 'false' || adminToolsValue === '0' || adminToolsValue === 'no'
    const isExplicitlyEnabled = adminToolsValue === 'true' || adminToolsValue === '1' || adminToolsValue === 'yes'
    if (!isDebugMode && (isExplicitlyDisabled || (process.env.NODE_ENV === 'production' && !isExplicitlyEnabled))) {
      return NextResponse.json(
        { error: 'Admin tools are not enabled. Set ENABLE_ADMIN_TOOLS=true to use this endpoint.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = TestEmailBodySchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { to, emailType } = validationResult.data
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'

    // Send test email based on type
    switch (emailType) {
      case 'sale_created': {
        const testSaleTitle = 'Test Yard Sale'
        const testSaleAddress = '123 Main St, Anytown, ST 12345'
        const testSaleDateRange = 'Sat, Dec 7 · 8:00 am – 2:00 pm'
        const testSaleUrl = `${baseUrl}/sales/test-sale-id`

        const react = React.createElement(SaleCreatedConfirmationEmail, {
          recipientName: 'Test User',
          saleTitle: testSaleTitle,
          saleAddress: testSaleAddress,
          dateRange: testSaleDateRange,
          saleUrl: testSaleUrl,
          manageUrl: `${baseUrl}/dashboard`,
        })

        await sendEmail({
          to,
          subject: getSaleCreatedSubject(testSaleTitle),
          type: 'sale_created_confirmation',
          react,
          metadata: {
            test: true,
            triggeredBy: 'admin_test_endpoint',
            emailType: 'sale_created',
          },
        })
        break
      }

      case 'favorites_digest': {
        // Create test sales data
        const testSales: Sale[] = [
          {
            id: 'test-sale-1',
            title: 'Test Yard Sale #1',
            address: '123 Main St',
            city: 'Anytown',
            state: 'ST',
            zip_code: '12345',
            date_start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            time_start: '08:00',
            date_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            time_end: '14:00',
            status: 'published',
            owner_id: 'test-owner-id',
            privacy_mode: 'exact',
            is_featured: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'test-sale-2',
            title: 'Test Yard Sale #2',
            address: '456 Oak Ave',
            city: 'Anytown',
            state: 'ST',
            zip_code: '12345',
            date_start: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString().split('T')[0],
            time_start: '09:00',
            date_end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString().split('T')[0],
            time_end: '15:00',
            status: 'published',
            owner_id: 'test-owner-id',
            privacy_mode: 'exact',
            is_featured: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]

        // Use a test profile ID for unsubscribe token generation
        // In production, this would be the actual user's profile ID
        const testProfileId = '00000000-0000-0000-0000-000000000000'
        
        const result = await sendFavoriteSalesStartingSoonDigestEmail({
          to,
          sales: testSales,
          userName: 'Test User',
          hoursBeforeStart: 24,
          profileId: testProfileId, // Pass test profileId for unsubscribe token generation
        })

        if (!result.ok) {
          return NextResponse.json(
            { error: 'Failed to send test email', details: result.error },
            { status: 500 }
          )
        }
        break
      }

      case 'seller_weekly': {
        // Create test analytics data
        const testMetrics: SellerWeeklyAnalytics = {
          totalViews: 150,
          totalSaves: 25,
          totalClicks: 45,
          topSales: [
            {
              saleId: 'test-sale-1',
              saleTitle: 'Test Yard Sale #1',
              views: 80,
              saves: 15,
              clicks: 25,
              ctr: 31.25,
            },
            {
              saleId: 'test-sale-2',
              saleTitle: 'Test Yard Sale #2',
              views: 70,
              saves: 10,
              clicks: 20,
              ctr: 28.57,
            },
          ],
        }

        const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const weekEnd = new Date().toISOString()

        // Use a test profile ID for unsubscribe token generation
        // In production, this would be the actual user's profile ID
        const testProfileId = '00000000-0000-0000-0000-000000000000'
        
        const result = await sendSellerWeeklyAnalyticsEmail({
          to,
          ownerDisplayName: 'Test Seller',
          metrics: testMetrics,
          weekStart,
          weekEnd,
          profileId: testProfileId, // Pass test profileId for unsubscribe token generation
        })

        if (!result.ok) {
          return NextResponse.json(
            { error: 'Failed to send test email', details: result.error },
            { status: 500 }
          )
        }
        break
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Test ${emailType} email sent successfully`,
      to,
      emailType,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[ADMIN_TEST_EMAIL] Error:', error)
    }

    return NextResponse.json(
      { error: 'Failed to send test email', details: errorMessage },
      { status: 500 }
    )
  }
}

