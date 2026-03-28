import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  dispatchGithubLoadTestWorkflow,
  type GithubDispatchBody,
} from '@/lib/load-test/githubWorkflowDispatch'

export const dynamic = 'force-dynamic'

function timingSafeEqualUtf8(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) {
      return false
    }
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * POST /api/admin/load-test/dispatch
 *
 * Requires admin session (assertAdminOrThrow) and header:
 *   X-Internal-Secret: <LOAD_TEST_DISPATCH_INTERNAL_SECRET>
 *
 * Never callable anonymously; GitHub API is only reached after both checks.
 */
export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    const expectedSecret = process.env.LOAD_TEST_DISPATCH_INTERNAL_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'Load test dispatch is not configured' },
        { status: 503 }
      )
    }

    const providedSecret = request.headers.get('X-Internal-Secret') ?? ''
    if (!timingSafeEqualUtf8(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: GithubDispatchBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await dispatchGithubLoadTestWorkflow(body)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
          repo: result.repo,
          refTried: result.refTried,
        },
        { status: result.status }
      )
    }

    return NextResponse.json({
      success: true,
      actionsUrl: result.actionsUrl,
      scenario: result.scenario,
      baseURL: result.baseURL,
      ref: result.ref,
    })
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
