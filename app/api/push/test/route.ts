/// <reference types="../../../../types/global" />
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T as _T } from '@/lib/supabase/tables'
import webpush from 'web-push'

function configureWebPushOrReturnError() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return 'Missing VAPID keys (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)'
  }
  try {
    webpush.setVapidDetails('mailto:admin@lootaura.com', publicKey, privateKey)
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown VAPID configuration error'
    return msg
  }
}

export async function POST(_request: NextRequest) {
  // Hard-disable in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    )
  }

  try {
    const vapidError = configureWebPushOrReturnError()
    if (vapidError) {
      return NextResponse.json({ ok: false, error: vapidError }, { status: 500 })
    }
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No subscriptions found' },
        { status: 404 }
      )
    }

    const payload = JSON.stringify({
      title: 'LootAura Test',
      body: 'This is a test notification from LootAura!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: '/explore',
      tag: 'test-notification'
    })

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            payload
          )
          return { success: true, endpoint: sub.endpoint }
        } catch (err) {
          console.error('Error sending notification:', err)
          const message = err instanceof Error ? err.message : String(err)
          return { success: false, endpoint: sub.endpoint, error: message }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - successful

    return NextResponse.json({
      success: true,
      sent: successful,
      failed,
      total: results.length
    })
  } catch (error) {
    console.error('Test notification error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
