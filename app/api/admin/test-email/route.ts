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

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/test-email
 * Send a test sale created confirmation email
 * 
 * Body: { to: string }
 * 
 * Only accessible to admins or in non-production environments
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin access (allows in debug mode for development)
    // In production, requires ADMIN_EMAILS env var
    const isProduction = process.env.NODE_ENV === 'production'
    
    if (isProduction) {
      try {
        await assertAdminOrThrow(request)
      } catch (adminError) {
        return NextResponse.json(
          { error: 'Forbidden: Admin access required' },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const { to } = body

    if (!to || typeof to !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "to" email address' },
        { status: 400 }
      )
    }

    // Validate email format with length limit to prevent ReDoS
    // RFC 5321 specifies max email length of 320 characters (64 local + @ + 255 domain)
    if (to.length > 320) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      )
    }

    // Use zod for safe email validation (prevents ReDoS attacks)
    const emailSchema = z.string().email('Invalid email address format')
    const validationResult = emailSchema.safeParse(to)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      )
    }

    // Send test email with static test data
    const testSaleTitle = 'Test Yard Sale'
    const testSaleAddress = '123 Main St, Anytown, ST 12345'
    const testSaleDateRange = 'Sat, Dec 7 · 8:00 am – 2:00 pm'
    const testSaleUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'}/sales/test-sale-id`

    const react = React.createElement(SaleCreatedConfirmationEmail, {
      recipientName: 'Test User',
      saleTitle: testSaleTitle,
      saleAddress: testSaleAddress,
      dateRange: testSaleDateRange,
      saleUrl: testSaleUrl,
      manageUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'}/dashboard`,
    })

    await sendEmail({
      to,
      subject: getSaleCreatedSubject(testSaleTitle),
      type: 'sale_created_confirmation',
      react,
      metadata: {
        test: true,
        triggeredBy: 'admin_test_endpoint',
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Test email sent successfully',
      to,
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

