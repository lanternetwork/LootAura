import * as Sentry from '@sentry/nextjs'

// Only enable Sentry in production
const isProduction = process.env.NODE_ENV === 'production'
const dsn = process.env.SENTRY_DSN

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
