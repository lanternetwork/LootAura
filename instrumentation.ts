// Gate: skip loading Sentry when explicitly disabled (unset = enabled)
const sentryEnabledEnv = process.env.NEXT_PUBLIC_SENTRY_ENABLED
const isSentryDisabled =
  sentryEnabledEnv !== undefined &&
  sentryEnabledEnv !== '' &&
  ['0', 'false', 'off'].includes(sentryEnabledEnv.toLowerCase())

export async function register() {
  if (isSentryDisabled) return
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
