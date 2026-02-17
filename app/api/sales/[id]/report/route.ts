// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminDb, getRlsDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { ReportSaleSchema } from '@/lib/validators/reportSale'
import { fail, ok } from '@/lib/http/json'
import { logger } from '@/lib/log'

async function reportHandler(req: NextRequest, { params }: { params: { id: string } }) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(req)
  if (csrfError) {
    return csrfError
  }

  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  }

  const saleId = params.id

  // Parse and validate request body
  let body: any
  try {
    body = await req.json()
  } catch (error) {
    return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
  }

  const validationResult = ReportSaleSchema.safeParse(body)
  if (!validationResult.success) {
    return fail(400, 'VALIDATION_ERROR', 'Invalid report data', validationResult.error)
  }

  const { reason, details } = validationResult.data

  // Verify sale exists and is visible to the reporting user
  // Read from view to check sale exists and get owner_id
  const { data: sale, error: saleError } = await supabase
    .from('sales_v2')
    .select('id, owner_id, title')
    .eq('id', saleId)
    .maybeSingle()

  if (saleError || !sale) {
    logger.warn('Report attempted on non-existent sale', {
      component: 'moderation',
      operation: 'report_sale',
      saleId,
      reporterId: user.id.substring(0, 8) + '...',
    })
    return fail(404, 'SALE_NOT_FOUND', 'Sale not found')
  }

  // Optional: Prevent self-reporting (recommended)
  if (sale.owner_id === user.id) {
    logger.warn('Self-report attempt', {
      component: 'moderation',
      operation: 'report_sale',
      saleId,
      reporterId: user.id.substring(0, 8) + '...',
    })
    // Still return success to avoid leaking information
    return ok({ reported: true })
  }

  // Dedupe: Check for existing recent report by same reporter for same sale and reason
  // Window: 24 hours
  // Use RLS-aware client - sale_reports has RLS INSERT policy that allows authenticated users to insert their own reports
  const rlsDb = await getRlsDb()
  const twentyFourHoursAgo = new Date()
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

  // Note: sale_reports has no SELECT policy for regular users, so we can't check for duplicates via RLS
  // We'll need to use admin client for the dedupe check, but use RLS for the insert
  const adminDb = getAdminDb()
  const { data: existingReport } = await fromBase(adminDb, 'sale_reports')
    .select('id')
    .eq('sale_id', saleId)
    .eq('reporter_profile_id', user.id) // profile_id = user.id
    .eq('reason', reason)
    .gte('created_at', twentyFourHoursAgo.toISOString())
    .maybeSingle()

  if (existingReport) {
    // Report already exists within dedupe window - treat as success
    logger.info('Duplicate report within dedupe window', {
      component: 'moderation',
      operation: 'report_sale',
      saleId,
      reporterId: user.id.substring(0, 8) + '...',
      reason,
    })
    return ok({ reported: true })
  }

  // Insert new report using RLS-aware client (sale_reports has RLS INSERT policy)
  const { error: insertError } = await fromBase(rlsDb, 'sale_reports')
    .insert({
      sale_id: saleId,
      reporter_profile_id: user.id, // profile_id = user.id
      reason,
      details: details || null,
      status: 'open',
    })
    .select('id')
    .single()

  if (insertError) {
    logger.error('Failed to insert sale report', insertError instanceof Error ? insertError : new Error(String(insertError)), {
      component: 'moderation',
      operation: 'report_sale',
      saleId,
      reporterId: user.id.substring(0, 8) + '...',
      reason,
    })
    return fail(500, 'REPORT_FAILED', 'Failed to submit report')
  }

  // Log successful report (no PII in details)
  logger.info('Sale report submitted', {
    component: 'moderation',
    operation: 'report_sale',
    saleId,
    reporterId: user.id.substring(0, 8) + '...',
    reason,
    hasDetails: !!details,
  })

  // Auto-hide logic: Check if sale should be auto-hidden
  // Threshold: 5+ unique reporters in last 24 hours
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const { data: recentReports, error: countError } = await fromBase(adminDb, 'sale_reports')
    .select('reporter_profile_id')
    .eq('sale_id', saleId)
    .gte('created_at', oneDayAgo.toISOString())

  if (!countError && recentReports) {
    // Count unique reporters
    const uniqueReporters = new Set(recentReports.map(r => r.reporter_profile_id).filter(Boolean))
    
    if (uniqueReporters.size >= 5) {
      // Auto-hide the sale (only if not already hidden)
      // First check if sale is already hidden to avoid unnecessary updates
      const { data: existingSale } = await fromBase(adminDb, 'sales')
        .select('moderation_status')
        .eq('id', saleId)
        .maybeSingle()
      
      // Only update if not already hidden
      if (existingSale && existingSale.moderation_status !== 'hidden_by_admin') {
        const { error: hideError } = await fromBase(adminDb, 'sales')
          .update({
            moderation_status: 'hidden_by_admin',
            moderation_notes: `Auto-hidden due to ${uniqueReporters.size} unique reports in 24h`,
          })
          .eq('id', saleId)

        if (!hideError) {
          logger.info('Sale auto-hidden due to report threshold', {
            component: 'moderation',
            operation: 'sale_auto_hidden',
            saleId,
            reportCount: uniqueReporters.size,
          })
        }
      }
    }
  }

  return ok({ reported: true })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  return withRateLimit(
    (request) => reportHandler(request, { params }),
    [Policies.REPORT_SALE],
    { userId }
  )(req)
}

