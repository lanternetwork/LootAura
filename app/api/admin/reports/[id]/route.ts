// Admin-only endpoint for updating sale reports and taking actions

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UpdateReportSchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'dismissed']).optional(),
  action_taken: z.string().max(500).optional().nullable(),
  admin_notes: z.string().max(2000).optional().nullable(),
  hide_sale: z.boolean().optional(),
  lock_account: z.boolean().optional(),
})

async function updateReportHandler(request: NextRequest, { params }: { params: { id: string } }) {
  let user: { id: string; email?: string }
  try {
    // Require admin access
    const adminResult = await assertAdminOrThrow(request)
    user = adminResult.user
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    )
  }

  try {
    const reportId = params.id

    // Parse and validate request body
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const validationResult = UpdateReportSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { status, action_taken, admin_notes, hide_sale, lock_account } = validationResult.data

    const adminDb = getAdminDb()

    // First, get the report to access sale_id and owner_id
    const { data: report, error: reportError } = await fromBase(adminDb, 'sale_reports')
      .select('id, sale_id, status')
      .eq('id', reportId)
      .maybeSingle()

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Update report record
    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (action_taken !== undefined) updateData.action_taken = action_taken
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes
    updateData.updated_at = new Date().toISOString()

    const { error: updateError } = await fromBase(adminDb, 'sale_reports')
      .update(updateData)
      .eq('id', reportId)

    if (updateError) {
      logger.error('Failed to update report', updateError instanceof Error ? updateError : new Error(String(updateError)), {
        component: 'moderation',
        operation: 'update_report',
        reportId,
      })
      return NextResponse.json(
        { error: 'Failed to update report' },
        { status: 500 }
      )
    }

    // Handle hide_sale action
    if (hide_sale) {
      const { error: hideError } = await fromBase(adminDb, 'sales')
        .update({
          moderation_status: 'hidden_by_admin',
          moderation_notes: `Hidden by admin via report ${reportId}`,
        })
        .eq('id', report.sale_id)

      if (!hideError) {
        logger.info('Sale hidden via report action', {
          component: 'moderation',
          operation: 'hide_sale',
          saleId: report.sale_id,
          reportId,
          adminEmail: user.email,
        })
      }
    }

    // Handle lock_account action
    if (lock_account) {
      // Get sale owner_id
      const { data: sale, error: saleError } = await fromBase(adminDb, 'sales')
        .select('owner_id')
        .eq('id', report.sale_id)
        .maybeSingle()

      if (!saleError && sale) {
        const { error: lockError } = await fromBase(adminDb, 'profiles')
          .update({
            is_locked: true,
            locked_at: new Date().toISOString(),
            locked_by: user.email || 'admin',
            lock_reason: `Locked via report ${reportId}`,
          })
          .eq('id', sale.owner_id)

        if (!lockError) {
          logger.info('Account locked via report action', {
            component: 'moderation',
            operation: 'lock_account',
            userId: sale.owner_id,
            reportId,
            adminEmail: user.email,
          })
        }
      }
    }

    logger.info('Report updated', {
      component: 'moderation',
      operation: 'update_report',
      reportId,
      status,
      hideSale: hide_sale,
      lockAccount: lock_account,
      adminEmail: user.email,
    })

    return NextResponse.json({
      ok: true,
      data: {
        reportId,
        ...updateData,
      },
    })
  } catch (error) {
    logger.error('Unexpected error in updateReportHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'moderation',
      operation: 'update_report',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  return withRateLimit(
    (req) => updateReportHandler(req, { params }),
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}

