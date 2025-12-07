/**
 * Job processor - dispatches jobs to type-specific handlers
 */

import { BaseJob, JOB_TYPES, ImagePostprocessJobPayload, CleanupOrphanedDataJobPayload, AnalyticsAggregateJobPayload, FavoriteSalesStartingSoonJobPayload, SellerWeeklyAnalyticsJobPayload } from './types'
import { retryJob, completeJob } from './queue'
import { logger } from '@/lib/log'
import * as Sentry from '@sentry/nextjs'

/**
 * Process a single job
 */
export async function processJob(job: BaseJob): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  
  try {
    logger.info('Processing job', {
      component: 'jobs/processor',
      jobId: job.id,
      jobType: job.type,
      attempts: job.attempts || 0,
    })

    let result: { success: boolean; error?: string }

    switch (job.type) {
      case JOB_TYPES.IMAGE_POSTPROCESS:
        result = await processImagePostprocessJob(job.payload as ImagePostprocessJobPayload)
        break
      
      case JOB_TYPES.CLEANUP_ORPHANED_DATA:
        result = await processCleanupOrphanedDataJob(job.payload as CleanupOrphanedDataJobPayload)
        break
      
      case JOB_TYPES.ANALYTICS_AGGREGATE:
        result = await processAnalyticsAggregateJob(job.payload as AnalyticsAggregateJobPayload)
        break
      
      case JOB_TYPES.FAVORITE_SALES_STARTING_SOON:
        result = await processFavoriteSalesStartingSoonJob(job.payload as FavoriteSalesStartingSoonJobPayload)
        break
      
      case JOB_TYPES.SELLER_WEEKLY_ANALYTICS:
        result = await processSellerWeeklyAnalyticsJob(job.payload as SellerWeeklyAnalyticsJobPayload)
        break
      
      default:
        result = { success: false, error: `Unknown job type: ${job.type}` }
    }

    const duration = Date.now() - startTime

    if (result.success) {
      logger.info('Job completed successfully', {
        component: 'jobs/processor',
        jobId: job.id,
        jobType: job.type,
        durationMs: duration,
      })
      await completeJob(job.id)
      return result
    } else {
      // Job failed - retry if under max attempts
      const willRetry = await retryJob(job)
      
      logger.warn('Job failed', {
        component: 'jobs/processor',
        jobId: job.id,
        jobType: job.type,
        error: result.error,
        willRetry,
        attempts: job.attempts || 0,
        durationMs: duration,
      })

      // Report to Sentry
      Sentry.captureException(new Error(result.error), {
        tags: {
          jobType: job.type,
          jobId: job.id,
          willRetry: String(willRetry),
        },
        extra: {
          payload: job.payload,
          attempts: job.attempts || 0,
        },
      })

      return result
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error('Job processing error', error instanceof Error ? error : new Error(errorMessage), {
      component: 'jobs/processor',
      jobId: job.id,
      jobType: job.type,
      durationMs: duration,
    })

    // Try to retry
    const willRetry = await retryJob(job)

    // Report to Sentry
    Sentry.captureException(error instanceof Error ? error : new Error(errorMessage), {
      tags: {
        jobType: job.type,
        jobId: job.id,
        willRetry: String(willRetry),
      },
      extra: {
        payload: job.payload,
        attempts: job.attempts || 0,
      },
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Process image post-processing job
 */
async function processImagePostprocessJob(payload: ImagePostprocessJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { imageUrl, saleId } = payload

    if (!imageUrl) {
      return { success: false, error: 'Missing imageUrl in payload' }
    }

    // Validate that the image URL is accessible
    // This is a non-critical check - if it fails, we log but don't fail the sale
    try {
      const response = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      
      if (!response.ok) {
        logger.warn('Image validation failed', {
          component: 'jobs/image-postprocess',
          imageUrl,
          saleId,
          status: response.status,
        })
        // Still return success - this is non-critical
      } else {
        logger.info('Image validated successfully', {
          component: 'jobs/image-postprocess',
          imageUrl,
          saleId,
        })
      }
    } catch (fetchError) {
      // Network error or timeout - log but don't fail
      logger.warn('Image validation error (non-critical)', {
        component: 'jobs/image-postprocess',
        imageUrl,
        saleId,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      })
    }

    // TODO: Add any additional post-processing here (e.g., metadata extraction, thumbnail generation)
    // For now, we just validate the image is accessible

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process orphaned data cleanup job
 */
async function processCleanupOrphanedDataJob(payload: CleanupOrphanedDataJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const admin = getAdminDb()
    const batchSize = payload.batchSize || 50
    const itemType = payload.itemType || 'items'

    let deletedCount = 0

    if (itemType === 'items') {
      // Find items with sale_id that doesn't exist in sales table
      // Use a subquery to find orphaned items
      const { data: orphanedItems, error: queryError } = await fromBase(admin, 'items')
        .select('id, sale_id')
        .limit(batchSize)

      if (queryError) {
        return { success: false, error: `Query error: ${queryError.message}` }
      }

      if (!orphanedItems || orphanedItems.length === 0) {
        return { success: true } // No orphaned items found
      }

      // Check which items are actually orphaned (sale doesn't exist)
      const orphanedIds: string[] = []
      for (const item of orphanedItems) {
        const { data: sale } = await fromBase(admin, 'sales')
          .select('id')
          .eq('id', item.sale_id)
          .maybeSingle()

        if (!sale) {
          orphanedIds.push(item.id)
        }
      }

      // Delete orphaned items
      if (orphanedIds.length > 0) {
        const { error: deleteError } = await fromBase(admin, 'items')
          .delete()
          .in('id', orphanedIds)

        if (deleteError) {
          return { success: false, error: `Delete error: ${deleteError.message}` }
        }

        deletedCount = orphanedIds.length
      }
    } else if (itemType === 'analytics_events') {
      // Find analytics_events with sale_id that doesn't exist
      const { data: orphanedEvents, error: queryError } = await fromBase(admin, 'analytics_events')
        .select('id, sale_id')
        .limit(batchSize)

      if (queryError) {
        return { success: false, error: `Query error: ${queryError.message}` }
      }

      if (!orphanedEvents || orphanedEvents.length === 0) {
        return { success: true }
      }

      // Check which events are actually orphaned
      const orphanedIds: string[] = []
      for (const event of orphanedEvents) {
        const { data: sale } = await fromBase(admin, 'sales')
          .select('id')
          .eq('id', event.sale_id)
          .maybeSingle()

        if (!sale) {
          orphanedIds.push(event.id)
        }
      }

      // Delete orphaned events
      if (orphanedIds.length > 0) {
        const { error: deleteError } = await fromBase(admin, 'analytics_events')
          .delete()
          .in('id', orphanedIds)

        if (deleteError) {
          return { success: false, error: `Delete error: ${deleteError.message}` }
        }

        deletedCount = orphanedIds.length
      }
    }

    logger.info('Orphaned data cleanup completed', {
      component: 'jobs/cleanup-orphaned',
      itemType,
      deletedCount,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process analytics aggregation job
 */
async function processAnalyticsAggregateJob(payload: AnalyticsAggregateJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const admin = getAdminDb()

    // Default to yesterday's date
    const targetDate = payload.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const saleId = payload.saleId

    // Get events for the target date
    const startOfDay = new Date(targetDate + 'T00:00:00Z')
    const endOfDay = new Date(targetDate + 'T23:59:59.999Z')

    let query = fromBase(admin, 'analytics_events')
      .select('sale_id, event_type, owner_id')
      .gte('ts', startOfDay.toISOString())
      .lte('ts', endOfDay.toISOString())
      .eq('is_test', false)

    if (saleId) {
      query = query.eq('sale_id', saleId)
    }

    const { data: events, error: queryError } = await query

    if (queryError) {
      return { success: false, error: `Query error: ${queryError.message}` }
    }

    if (!events || events.length === 0) {
      logger.info('No events to aggregate', {
        component: 'jobs/analytics-aggregate',
        date: targetDate,
        saleId,
      })
      return { success: true }
    }

    // Aggregate by sale_id and event_type
    const aggregates = new Map<string, { saleId: string; ownerId: string; eventType: string; count: number }>()

    for (const event of events) {
      const key = `${event.sale_id}:${event.event_type}`
      const existing = aggregates.get(key)
      
      if (existing) {
        existing.count++
      } else {
        aggregates.set(key, {
          saleId: event.sale_id,
          ownerId: event.owner_id,
          eventType: event.event_type,
          count: 1,
        })
      }
    }

    // TODO: Store aggregates in a summary table if one exists
    // For now, we just log the aggregates
    logger.info('Analytics aggregation completed', {
      component: 'jobs/analytics-aggregate',
      date: targetDate,
      saleId,
      aggregateCount: aggregates.size,
      totalEvents: events.length,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process favorite sales starting soon job
 * 
 * Scans favorites for sales starting within the configured time window and sends
 * digest emails to users. Consolidates multiple favorited sales into a single
 * digest email per user to reduce inbox spam while preserving timely reminders.
 * 
 * Behavior:
 * - Groups eligible favorites by user_id
 * - Sends one digest email per user containing all their upcoming favorited sales
 * - Marks all included favorites as notified (start_soon_notified_at) on successful send
 * - Uses existing idempotency: only favorites with null start_soon_notified_at are processed
 */
export async function processFavoriteSalesStartingSoonJob(
  _payload: FavoriteSalesStartingSoonJobPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { FAVORITE_SALE_STARTING_SOON_ENABLED, FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START } = await import('@/lib/config/email')
    
    // Check if feature is enabled
    if (!FAVORITE_SALE_STARTING_SOON_ENABLED) {
      logger.info('Favorite sale starting soon emails are disabled', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const { sendFavoriteSalesStartingSoonDigestEmail } = await import('@/lib/email/favorites')
    const { getUserProfile } = await import('@/lib/data/profileAccess')
    const admin = getAdminDb()

    // Calculate time window: sales starting within the configured hours
    const now = new Date()
    const nowUtc = new Date(now.toISOString())
    // Allow a small buffer (1 hour) for sales that just started to account for timing differences
    const oneHourAgo = new Date(nowUtc.getTime() - 60 * 60 * 1000)
    const hoursFromNow = new Date(nowUtc.getTime() + FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START * 60 * 60 * 1000)

    // Query favorites that have not been notified
    const { data: favorites, error: favoritesError } = await fromBase(admin, 'favorites')
      .select('user_id, sale_id, start_soon_notified_at')
      .is('start_soon_notified_at', null)

    if (favoritesError) {
      return { success: false, error: `Favorites query error: ${favoritesError.message}` }
    }

    if (!favorites || favorites.length === 0) {
      logger.info('No favorites to process for starting soon notifications', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    // Get unique sale IDs
    const saleIds = [...new Set(favorites.map(f => f.sale_id))]
    
    // Query sales that are published
    const { data: sales, error: salesError } = await fromBase(admin, 'sales')
      .select('*')
      .in('id', saleIds)
      .eq('status', 'published')

    if (salesError) {
      return { success: false, error: `Sales query error: ${salesError.message}` }
    }

    if (!sales || sales.length === 0) {
      logger.info('No published sales found for favorites', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    // Filter sales that are starting within the configured window
    // Allow sales that started up to 1 hour ago to account for timing differences
    const salesStartingSoon = sales.filter(sale => {
      try {
        const startDateTime = new Date(`${sale.date_start}T${sale.time_start || '00:00'}Z`) // Explicitly UTC
        return startDateTime >= oneHourAgo && startDateTime <= hoursFromNow
      } catch {
        return false
      }
    })

      if (salesStartingSoon.length === 0) {
        logger.info('No sales starting within configured window', {
          component: 'jobs/favorite-sales-starting-soon',
          hoursBeforeStart: FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START,
        })
        return { success: true }
      }

    const saleIdsStartingSoon = new Set(salesStartingSoon.map(s => s.id))

    // Filter favorites to only those for sales starting soon
    const eligibleFavorites = favorites.filter(f => saleIdsStartingSoon.has(f.sale_id))

    if (eligibleFavorites.length === 0) {
      logger.info('No eligible favorites found', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    // Get unique user IDs
    const userIds = [...new Set(eligibleFavorites.map(f => f.user_id))]

    // Query auth.users for email addresses using admin client
    // Note: We use the admin client's auth.admin.listUsers() method
    // which is the proper way to access user emails with service role
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!
    const { createClient } = await import('@supabase/supabase-js')
    const adminBase = createClient(url, key, { 
      auth: { persistSession: false },
      global: { headers: { 'apikey': key } }
    })

    // Fetch users using Admin API
    // We'll fetch all users and filter in memory (Admin API doesn't support .in() filter)
    const { data: usersList, error: usersError } = await adminBase.auth.admin.listUsers()
    
    if (usersError) {
      const errorMessage = usersError instanceof Error ? usersError.message : String(usersError)
      return { success: false, error: `Users query error: ${errorMessage}` }
    }

    // Filter to only users we need
    const users = usersList?.users?.filter(u => userIds.includes(u.id)) || []

    if (!users || users.length === 0) {
      logger.warn('No users found with email addresses', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    // Fetch user profiles to check notification preferences
    // Only include users who have email_favorites_digest_enabled = true (default true)
    const { data: profiles, error: profilesError } = await fromBase(admin, 'profiles')
      .select('id, email_favorites_digest_enabled')
      .in('id', userIds)
      .eq('email_favorites_digest_enabled', true)

    if (profilesError) {
      logger.warn('Error fetching profiles for notification preferences, proceeding with all users', {
        component: 'jobs/favorite-sales-starting-soon',
        error: profilesError.message,
      })
    }

    // Create set of user IDs with preferences enabled (if profiles query succeeded)
    const enabledUserIds = profilesError 
      ? new Set(userIds) // If query failed, include all users (fail open)
      : new Set(profiles?.map(p => p.id) || [])

    // Create a map of user_id -> email (only for users with preferences enabled)
    const userEmailMap = new Map<string, string>()
    for (const user of users) {
      if (user.email && enabledUserIds.has(user.id)) {
        userEmailMap.set(user.id, user.email)
      }
    }

    // Create a map of sale_id -> sale
    const saleMap = new Map(salesStartingSoon.map(s => [s.id, s]))

    // Group eligible favorites by user_id
    const favoritesByUser = new Map<string, Array<{ user_id: string; sale_id: string }>>()
    for (const favorite of eligibleFavorites) {
      const sale = saleMap.get(favorite.sale_id)
      const userEmail = userEmailMap.get(favorite.user_id)

      // Only include favorites where we have both sale and user email
      if (sale && userEmail) {
        if (!favoritesByUser.has(favorite.user_id)) {
          favoritesByUser.set(favorite.user_id, [])
        }
        favoritesByUser.get(favorite.user_id)!.push(favorite)
      }
    }

    if (favoritesByUser.size === 0) {
      logger.info('No eligible user-sale pairs found for digest emails', {
        component: 'jobs/favorite-sales-starting-soon',
      })
      return { success: true }
    }

    // Process each user group and send digest emails
    let digestEmailsSent = 0
    let errors = 0
    const notifiedFavoriteIds: Array<{ user_id: string; sale_id: string }> = []

    for (const [userId, userFavorites] of favoritesByUser.entries()) {
      const userEmail = userEmailMap.get(userId)
      if (!userEmail) {
        logger.warn('Skipping user - no email address', {
          component: 'jobs/favorite-sales-starting-soon',
          userId,
        })
        continue
      }

      try {
        // Get user profile for display name
        let userName: string | null = null
        try {
          const profile = await getUserProfile(adminBase, userId)
          userName = profile?.display_name || null
        } catch {
          // Profile fetch failed - continue without display name
        }

        // Collect all sales for this user
        const userSales = userFavorites
          .map(fav => saleMap.get(fav.sale_id))
          .filter((sale): sale is typeof sale & { id: string } => sale !== undefined)

        if (userSales.length === 0) {
          continue
        }

        // Send digest email
        // Note: userId is the same as profileId in Supabase (same UUID)
        const result = await sendFavoriteSalesStartingSoonDigestEmail({
          to: userEmail,
          sales: userSales,
          userName,
          hoursBeforeStart: FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START,
          profileId: userId, // Pass profileId for unsubscribe token generation
        })

        if (result.ok) {
          digestEmailsSent++
          // Mark all favorites for this user as notified
          for (const favorite of userFavorites) {
            notifiedFavoriteIds.push({
              user_id: favorite.user_id,
              sale_id: favorite.sale_id,
            })
          }
        } else {
          errors++
          logger.warn('Failed to send favorite sales starting soon digest email', {
            component: 'jobs/favorite-sales-starting-soon',
            userId,
            salesCount: userSales.length,
            error: result.error,
          })
        }
      } catch (error) {
        errors++
        logger.error('Error processing user for starting soon digest email', error instanceof Error ? error : new Error(String(error)), {
          component: 'jobs/favorite-sales-starting-soon',
          userId,
          favoritesCount: userFavorites.length,
        })
      }
    }

    // Update start_soon_notified_at for successfully sent emails
    if (notifiedFavoriteIds.length > 0) {
      const nowTimestamp = new Date().toISOString()
      
      // Update each favorite individually (Supabase doesn't support multi-row updates with composite keys easily)
      for (const favorite of notifiedFavoriteIds) {
        const { error: updateError } = await fromBase(admin, 'favorites')
          .update({ start_soon_notified_at: nowTimestamp })
          .eq('user_id', favorite.user_id)
          .eq('sale_id', favorite.sale_id)

        if (updateError) {
          const errorObj = updateError instanceof Error ? updateError : new Error((updateError as { message?: string })?.message || String(updateError))
          logger.error('Failed to update start_soon_notified_at', errorObj, {
            component: 'jobs/favorite-sales-starting-soon',
            favoriteUserId: favorite.user_id,
            saleId: favorite.sale_id,
          })
        }
      }
    }

    logger.info('Favorite sales starting soon job completed', {
      component: 'jobs/favorite-sales-starting-soon',
      eligibleFavorites: eligibleFavorites.length,
      usersProcessed: favoritesByUser.size,
      digestEmailsSent,
      errors,
      favoritesNotified: notifiedFavoriteIds.length,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Process seller weekly analytics job
 * Sends weekly analytics emails to sellers with published sales
 */
export async function processSellerWeeklyAnalyticsJob(
  payload: SellerWeeklyAnalyticsJobPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSellerWeeklyAnalyticsEnabled } = await import('@/lib/config/email')
    
    // Check if feature is enabled (read dynamically for tests)
    if (!getSellerWeeklyAnalyticsEnabled()) {
      logger.info('Seller weekly analytics emails are disabled', {
        component: 'jobs/seller-weekly-analytics',
      })
      return { success: true }
    }

    const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
    const { sendSellerWeeklyAnalyticsEmail } = await import('@/lib/email/sellerAnalytics')
    const { getSellerWeeklyAnalytics } = await import('@/lib/data/sellerAnalytics')
    const { getUserProfile } = await import('@/lib/data/profileAccess')
    const admin = getAdminDb()

    // Calculate last full 7-day window
    // If run on Monday at 09:00, compute [previous Monday 00:00, current Monday 00:00)
    const now = new Date()
    const nowUtc = new Date(now.toISOString())
    
    // If a specific date is provided, use it; otherwise use today
    const referenceDate = payload.date ? new Date(payload.date) : nowUtc
    
    // Get the start of the week (Monday) for the reference date
    const dayOfWeek = referenceDate.getUTCDay() // 0 = Sunday, 1 = Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Days to subtract to get to Monday
    
    // Start of current week (Monday 00:00:00 UTC)
    const weekStart = new Date(referenceDate)
    weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday)
    weekStart.setUTCHours(0, 0, 0, 0)
    
    // End of current week (next Monday 00:00:00 UTC, exclusive)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)
    
    // For weekly report, we want the PREVIOUS week (last full week)
    const reportWeekStart = new Date(weekStart)
    reportWeekStart.setUTCDate(reportWeekStart.getUTCDate() - 7)
    const reportWeekEnd = new Date(weekStart)

    logger.info('Processing seller weekly analytics job', {
      component: 'jobs/seller-weekly-analytics',
      reportWeekStart: reportWeekStart.toISOString(),
      reportWeekEnd: reportWeekEnd.toISOString(),
    })

    // Find owners with published sales OR analytics events in the window
    // We'll query both and merge the results
    const { data: sales, error: salesError } = await fromBase(admin, 'sales')
      .select('owner_id')
      .eq('status', 'published')
      .gte('created_at', reportWeekStart.toISOString())
      .lt('created_at', reportWeekEnd.toISOString())

    if (salesError) {
      return { success: false, error: `Sales query error: ${salesError.message}` }
    }

    // Also get owners from analytics events
    const { data: events, error: eventsError } = await fromBase(admin, 'analytics_events')
      .select('owner_id')
      .gte('ts', reportWeekStart.toISOString())
      .lt('ts', reportWeekEnd.toISOString())
      .eq('is_test', false)

    if (eventsError) {
      // Log but don't fail - we can still process sales owners
      logger.warn('Error querying analytics events for owner discovery', {
        component: 'jobs/seller-weekly-analytics',
        error: eventsError.message,
      })
    }

    // Get unique owner IDs
    const ownerIds = new Set<string>()
    sales?.forEach((sale: { owner_id: string }) => {
      if (sale.owner_id) {
        ownerIds.add(sale.owner_id)
      }
    })
    events?.forEach((event: { owner_id: string }) => {
      if (event.owner_id) {
        ownerIds.add(event.owner_id)
      }
    })

    if (ownerIds.size === 0) {
      logger.info('No eligible owners found for weekly analytics', {
        component: 'jobs/seller-weekly-analytics',
      })
      return { success: true }
    }

    // Get user emails using Admin API
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE!
    const { createClient } = await import('@supabase/supabase-js')
    const adminBase = createClient(url, key, { 
      auth: { persistSession: false },
      global: { headers: { 'apikey': key } }
    })

    // Fetch users using Admin API
    const { data: usersList, error: usersError } = await adminBase.auth.admin.listUsers()
    
    if (usersError) {
      const errorMessage = usersError instanceof Error ? usersError.message : String(usersError)
      return { success: false, error: `Users query error: ${errorMessage}` }
    }

    // Filter to only owners we need
    const users = usersList?.users?.filter(u => ownerIds.has(u.id) && u.email) || []

    if (users.length === 0) {
      logger.warn('No users found with email addresses', {
        component: 'jobs/seller-weekly-analytics',
      })
      return { success: true }
    }

    // Fetch user profiles to check notification preferences
    // Only include users who have email_seller_weekly_enabled = true (default true)
    const ownerIdArray = Array.from(ownerIds)
    const { data: profiles, error: profilesError } = await fromBase(admin, 'profiles')
      .select('id, email_seller_weekly_enabled')
      .in('id', ownerIdArray)
      .eq('email_seller_weekly_enabled', true)

    if (profilesError) {
      logger.warn('Error fetching profiles for notification preferences, proceeding with all users', {
        component: 'jobs/seller-weekly-analytics',
        error: profilesError.message,
      })
    }

    // Create set of user IDs with preferences enabled (if profiles query succeeded)
    const enabledOwnerIds = profilesError
      ? new Set(ownerIds) // If query failed, include all users (fail open)
      : new Set(profiles?.map(p => p.id) || [])

    // Process each owner (only those with preferences enabled)
    let emailsSent = 0
    let errors = 0

    for (const user of users) {
      if (!user.email || !enabledOwnerIds.has(user.id)) continue

      try {
        // Get user profile for display name
        let ownerDisplayName: string | null = null
        try {
          const profile = await getUserProfile(adminBase, user.id)
          ownerDisplayName = profile?.display_name || null
        } catch {
          // Profile fetch failed - continue without display name
        }

        // Fetch metrics for this owner
        const metrics = await getSellerWeeklyAnalytics(
          adminBase,
          user.id,
          reportWeekStart.toISOString(),
          reportWeekEnd.toISOString()
        )

        // Only send if there are metrics
        if (metrics.totalViews === 0 && metrics.totalSaves === 0 && metrics.totalClicks === 0) {
          continue
        }

        // Send email
        // Note: user.id is the same as profileId in Supabase (same UUID)
        const result = await sendSellerWeeklyAnalyticsEmail({
          to: user.email,
          ownerDisplayName,
          metrics,
          weekStart: reportWeekStart.toISOString(),
          weekEnd: reportWeekEnd.toISOString(),
          profileId: user.id, // Pass profileId for unsubscribe token generation
        })

        if (result.ok) {
          emailsSent++
        } else {
          errors++
          logger.warn('Failed to send seller weekly analytics email', {
            component: 'jobs/seller-weekly-analytics',
            ownerId: user.id,
            error: result.error,
          })
        }
      } catch (error) {
        errors++
        logger.error('Error processing seller weekly analytics', error instanceof Error ? error : new Error(String(error)), {
          component: 'jobs/seller-weekly-analytics',
          ownerId: user.id,
        })
      }
    }

    logger.info('Seller weekly analytics job completed', {
      component: 'jobs/seller-weekly-analytics',
      eligibleOwners: ownerIds.size,
      emailsSent,
      errors,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

