/**
 * TEMPORARY DEBUG: raw HTTP POST to GoTrue /auth/v1/signup with anon key only.
 * Remove after BUG-002 isolation. Do not use in production logic.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEBUG_EMAIL = 'directtest2@gmail.com'
const DEBUG_PASSWORD = 'Test123456!'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!baseUrl || !anon) {
    return NextResponse.json(
      {
        ok: false,
        keyType: 'anon',
        httpStatus: null,
        rawBody: null,
        error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
        responseHeaders: null,
      },
      { status: 500 }
    )
  }

  const signupUrl = `${baseUrl}/auth/v1/signup`

  const res = await fetch(signupUrl, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: DEBUG_EMAIL,
      password: DEBUG_PASSWORD,
    }),
  })

  const text = await res.text()
  let rawJson: unknown = null
  try {
    rawJson = JSON.parse(text) as unknown
  } catch {
    rawJson = { parseError: true, textSnippet: text.slice(0, 500) }
  }

  const usefulHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    if (
      /^x-/i.test(k) ||
      /ratelimit/i.test(k) ||
      /retry/i.test(k) ||
      k === 'content-type'
    ) {
      usefulHeaders[k] = v
    }
  })

  return NextResponse.json({
    ok: res.ok,
    keyType: 'anon',
    requestUrl: signupUrl,
    httpStatus: res.status,
    rawBody: rawJson,
    responseHeaders: usefulHeaders,
  })
}
