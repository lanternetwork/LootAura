import * as Sentry from '@sentry/nextjs'

// Only enable Sentry in production
const isProduction = process.env.NODE_ENV === 'production'
const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn: isProduction ? dsn : undefined,
  enabled: isProduction && !!dsn,

  // Performance monitoring
  tracesSampleRate: 0.1,

  // Privacy: Do not send PII
  sendDefaultPii: false,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Disable console logging from Sentry
  debug: false,

  // No session replay
  // Do not include replayIntegration

  // Integrations (minimal, no replay)
  integrations: [],

  // Ignore common non-actionable errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'atomicFindClose',
    // Network errors that are often not actionable
    'NetworkError',
    'Network request failed',
    'Failed to fetch',
    // ResizeObserver errors (common browser quirk)
    'ResizeObserver loop limit exceeded',
  ],
})
