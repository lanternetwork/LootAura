import * as Sentry from '@sentry/nextjs'
import { startIngestedSalesAutoRepair } from '@/lib/ingestion/startupAutoRepair'
import { startPreviewGeocodeSelfTest } from '@/lib/ingestion/startupPreviewGeocodeSelfTest'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    startIngestedSalesAutoRepair()
    startPreviewGeocodeSelfTest()
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
