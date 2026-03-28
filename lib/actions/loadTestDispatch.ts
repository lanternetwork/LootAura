'use server'

import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export type DispatchLoadTestPanelResult =
  | {
      ok: true
      actionsUrl: string
      scenario: string
      baseURL: string
      ref: string
    }
  | {
      ok: false
      error: string
      details?: string
      status: number
    }

/**
 * Admin UI entry point: verifies admin session, then calls the dispatch API
 * with X-Internal-Secret from env (never exposed to the browser).
 */
export async function dispatchLoadTestFromAdminPanel(input: {
  scenario: string
  baseURL: string
}): Promise<DispatchLoadTestPanelResult> {
  try {
    await assertAdminOrThrow(new Request('http://localhost'))
  } catch (e) {
    if (e instanceof NextResponse) {
      const data = (await e.json().catch(() => ({}))) as { error?: string }
      return {
        ok: false,
        error: data.error ?? 'Unauthorized',
        status: e.status,
      }
    }
    throw e
  }

  const secret = process.env.LOAD_TEST_DISPATCH_INTERNAL_SECRET
  if (!secret) {
    return {
      ok: false,
      error: 'Load test dispatch is not configured',
      status: 503,
    }
  }

  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ')

  const h = await headers()
  const origin =
    process.env.VERCEL_URL != null && process.env.VERCEL_URL !== ''
      ? `https://${process.env.VERCEL_URL}`
      : (() => {
          const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
          const proto = h.get('x-forwarded-proto') ?? 'http'
          return `${proto}://${host}`
        })()

  const res = await fetch(`${origin}/api/admin/load-test/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify({ scenario: input.scenario, baseURL: input.baseURL }),
  })

  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    details?: string
    actionsUrl?: string
    scenario?: string
    baseURL?: string
    ref?: string
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `HTTP ${res.status}`,
      details: data.details,
      status: res.status,
    }
  }

  return {
    ok: true,
    actionsUrl: data.actionsUrl ?? '',
    scenario: data.scenario ?? input.scenario,
    baseURL: data.baseURL ?? input.baseURL,
    ref: data.ref ?? '',
  }
}
