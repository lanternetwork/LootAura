import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getCloudinaryConfig } from '@/lib/cloudinary'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

async function avatarHandler(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }

  const cfg = getCloudinaryConfig()
  if (!cfg) return NextResponse.json({ ok: false, error: 'Cloudinary not configured' }, { status: 501 })

  // Check if unsigned upload preset is available (preferred method)
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  
  if (uploadPreset) {
    // Use unsigned upload preset (simpler, no signature needed)
    // Note: eager transformations should be configured in the upload preset, not passed as parameter
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AVATAR] using unsigned upload preset:', uploadPreset)
    }
    return NextResponse.json({
      ok: true,
      data: {
        cloud_name: cfg.cloudName,
        upload_preset: uploadPreset,
        folder: `avatars/${user.id}`,
        // Don't include eager - it should be configured in the upload preset
      },
    })
  }

  // Fallback to signed upload (requires API secret)
  // Cloudinary signed upload signature generation
  // All parameters EXCEPT file, api_key, and signature must be included in signature
  // Parameters must be sorted lexicographically
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `avatars/${user.id}`
  const eager = 'c_fill,g_face,r_max,w_256,h_256'
  
  // Validate timestamp (must be within 120 seconds)
  const now = Math.floor(Date.now() / 1000)
  if (timestamp > now + 120) {
    return NextResponse.json({ ok: false, error: 'Invalid timestamp' }, { status: 400 })
  }
  
  // Build params object with all parameters that will be sent (except file, api_key, signature)
  const params: Record<string, string> = {
    eager,
    folder,
    timestamp: String(timestamp),
  }
  
  // Sort keys lexicographically and build signature string
  const sortedKeys = Object.keys(params).sort()
  const paramsToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&')
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AVATAR] sign params', { folder, timestamp, eager })
  }
  
  // Generate HMAC-SHA1 signature
  const signature = createHmac('sha1', cfg.apiSecret).update(paramsToSign).digest('hex')

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AVATAR] generated signature for params:', paramsToSign)
  }

  return NextResponse.json({
    ok: true,
    data: {
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      timestamp,
      folder,
      eager,
      signature,
    },
  })
}

export async function POST(request: NextRequest) {
  // Get user ID for rate limiting
  const sb = createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  const userId = user?.id

  return withRateLimit(
    avatarHandler,
    [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(request)
}

