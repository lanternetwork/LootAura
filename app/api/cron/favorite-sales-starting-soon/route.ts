/**
 * Legacy cron endpoint for "Favorite Sale Starting Soon" email job.
 *
 * This path is kept for backwards compatibility and delegates to the
 * canonical `/api/cron/favorites-starting-soon` implementation so
 * behavior cannot drift.
 */

import { NextRequest } from 'next/server'
import {
  GET as CanonicalGet,
  POST as CanonicalPost,
  dynamic as canonicalDynamic,
} from '../favorites-starting-soon/route'

export const dynamic = canonicalDynamic

export async function GET(request: NextRequest) {
  return CanonicalGet(request)
}

export async function POST(request: NextRequest) {
  return CanonicalPost(request)
}


