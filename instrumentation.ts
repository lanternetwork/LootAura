import * as Sentry from '@sentry/nextjs'
import { startIngestedSalesAutoRepair } from '@/lib/ingestion/startupAutoRepair'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    startIngestedSalesAutoRepair()
    const { startPreviewGeocodeSelfTest } = await import('@/lib/ingestion/startupPreviewGeocodeSelfTest')
    startPreviewGeocodeSelfTest()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
