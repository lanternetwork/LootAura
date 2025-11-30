/**
 * Email configuration flags and thresholds
 * Server-only module for controlling email behavior
 * 
 * Environment variables:
 * - EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED: Enable/disable favorite sale starting soon emails (default: true)
 * - EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START: Hours before sale start to send reminder (default: 24)
 * - EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED: Enable/disable seller weekly analytics emails (default: true)
 */

/**
 * Configuration for favorite sale starting soon emails
 */
export const FAVORITE_SALE_STARTING_SOON_ENABLED: boolean = (() => {
  const value = process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED
  if (value === undefined || value === '') {
    return true // Default: enabled
  }
  return value.toLowerCase() === 'true'
})()

export const FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START: number = (() => {
  const value = process.env.EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START
  if (value === undefined || value === '') {
    return 24 // Default: 24 hours
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) {
    return 24 // Fallback to safe default
  }
  return parsed
})()

/**
 * Configuration for seller weekly analytics emails
 */
export function getSellerWeeklyAnalyticsEnabled(): boolean {
  const value = process.env.EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED
  if (value === undefined || value === '') {
    return true // Default: enabled
  }
  return value.toLowerCase() === 'true'
}

// Export as constant for backward compatibility (reads at module load time)
// For tests, use getSellerWeeklyAnalyticsEnabled() function instead
export const SELLER_WEEKLY_ANALYTICS_ENABLED: boolean = getSellerWeeklyAnalyticsEnabled()

