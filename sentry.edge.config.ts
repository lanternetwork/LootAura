import * as Sentry from '@sentry/nextjs'

// Gate: unset = enabled; set to "0" | "false" | "off" (case-insensitive) = disabled
const sentryEnabledEnv = process.env.NEXT_PUBLIC_SENTRY_ENABLED
const isSentryDisabled =
  sentryEnabledEnv !== undefined &&
  sentryEnabledEnv !== '' &&
  ['0', 'false', 'off'].includes(sentryEnabledEnv.toLowerCase())
const sentryEnabled = !isSentryDisabled

// Only enable Sentry in production when flag allows
const isProduction = process.env.NODE_ENV === 'production'
const dsn = process.env.SENTRY_DSN

if (sentryEnabled) {
Sentry.init({
  dsn: isProduction ? dsn : undefined,
  enabled: isProduction && !!dsn,

  // Performance monitoring
  tracesSampleRate: 0.1,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Disable console logging from Sentry
  debug: false,
})
}
