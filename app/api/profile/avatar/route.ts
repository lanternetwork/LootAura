import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getCloudinaryConfig } from '@/lib/cloudinary'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const cfg = getCloudinaryConfig()
  if (!cfg) return NextResponse.json({ ok: false, error: 'Cloudinary not configured' }, { status: 501 })

  // Check if unsigned upload preset is available (preferred method)
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  
  if (uploadPreset) {
    // Use unsigned upload preset (simpler, no signature needed)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[AVATAR] using unsigned upload preset:', uploadPreset)
    }
    return NextResponse.json({
      ok: true,
      data: {
        cloud_name: cfg.cloudName,
        upload_preset: uploadPreset,
        folder: `avatars/${user.id}`,
        eager: 'c_fill,g_face,r_max,w_256,h_256',
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
    console.log('[AVATAR] signing params:', paramsToSign)
  }
  
  // Generate HMAC-SHA1 signature
  const signature = createHmac('sha1', cfg.apiSecret).update(paramsToSign).digest('hex')

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AVATAR] generated signature:', signature, 'for params:', { eager, folder, timestamp })
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


