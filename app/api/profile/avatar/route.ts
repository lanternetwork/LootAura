import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getCloudinaryConfig } from '@/lib/cloudinary'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  const sb = createSupabaseServerClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const cfg = getCloudinaryConfig()
  if (!cfg) return NextResponse.json({ ok: false, error: 'Cloudinary not configured' }, { status: 501 })

  // Basic signature for unsigned upload preset or direct folder
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `avatars/${user.id}`
  // Example: limit transformations server-allowed (e.g., max 512x512)
  const eager = 'c_fill,g_face,r_max,w_256,h_256'
  const paramsToSign = `eager=${eager}&folder=${folder}&timestamp=${timestamp}`
  const signature = crypto.createHash('sha1').update(paramsToSign + cfg.apiSecret).digest('hex')

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[AVATAR] upload requested -> signature issued')
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


