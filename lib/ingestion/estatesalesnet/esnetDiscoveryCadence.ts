/**
 * ES.net discovery cadence (2–4 passes/day) without extra Vercel cron entries.
 * Runs on a subset of shared `/api/cron/discovery` invocations (02/08/14/20 UTC).
 */

const ESNET_DISCOVERY_UTC_HOURS = new Set([2, 8, 14, 20])

export function shouldRunEsnetDiscoveryThisInvocation(now: Date = new Date()): boolean {
  return ESNET_DISCOVERY_UTC_HOURS.has(now.getUTCHours())
}
