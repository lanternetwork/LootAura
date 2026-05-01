import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

/** Only these scenario ids may be passed to the CLI (no user-controlled spawn args beyond this allowlist). */
const VALID_SCENARIOS = [
  'sales-baseline',
  'sales-burst',
  'sales-sustained',
  'geo-cache-warmup',
  'geo-abuse',
  'auth-signin',
  'auth-magic-link',
  'mutation-sales',
  'multi-ip-sales',
] as const

type ValidScenario = (typeof VALID_SCENARIOS)[number]

const LOAD_TEST_CLI = join(process.cwd(), 'scripts/load/cli.ts')
/** Fixed target; request body must not influence spawn arguments beyond scenario id. */
const FIXED_BASE_URL = 'http://localhost:3000'

function invalidScenarioResponse() {
  return Response.json(
    {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid scenario',
      },
      validScenarios: [...VALID_SCENARIOS],
    },
    { status: 400 }
  )
}

function errorResponse(code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_REQUEST', message: string, status: number) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status }
  )
}

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)

    if (process.env.NODE_ENV === 'production') {
      return new Response('Not found', { status: 404 })
    }

    if (process.env.VERCEL === '1') {
      return NextResponse.json(
        {
          error: 'Load testing is unavailable in Vercel environments',
          message: 'Run load tests locally or use GitHub Actions dispatch from admin tools.',
        },
        { status: 501 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return invalidScenarioResponse()
    }

    const scenario =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { scenario?: unknown }).scenario
        : undefined

    if (!scenario) {
      return invalidScenarioResponse()
    }

    if (typeof scenario !== 'string' || !VALID_SCENARIOS.includes(scenario as ValidScenario)) {
      return invalidScenarioResponse()
    }

    const args = [LOAD_TEST_CLI, '--scenario', scenario, '--baseURL', FIXED_BASE_URL]

    const env = {
      ...process.env,
      NODE_ENV: 'production' as const,
      RATE_LIMITING_ENABLED: 'true',
    }

    return new Promise<NextResponse>((resolve) => {
      const output: string[] = []
      let metrics: any = null

      const child = spawn('tsx', args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      }) as ChildProcess

      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim())
        output.push(...lines)
      })

      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim())
        output.push(...lines)
      })

      child.on('close', (code: number | null) => {
        if (code === 0) {
          const summaryLine = output.find((line) => line.includes('Load Test Summary'))
          if (summaryLine) {
            const summaryIndex = output.indexOf(summaryLine)
            const summaryLines = output.slice(summaryIndex, summaryIndex + 10)

            metrics = {
              totalRequests: extractMetric(summaryLines, 'Total Requests'),
              successRate: extractMetric(summaryLines, 'Success Rate'),
              error429Count: extractMetric(summaryLines, '429 Errors'),
              medianLatency: extractMetric(summaryLines, 'Median Latency'),
              timeToFirst429: extractMetric(summaryLines, 'Time to First 429'),
            }
          }

          resolve(
            NextResponse.json({
              success: true,
              scenario,
              output,
              metrics,
              exitCode: code,
            })
          )
        } else {
          resolve(
            NextResponse.json(
              {
                success: false,
                scenario,
                output,
                error: `Process exited with code ${code}`,
                exitCode: code,
              },
              { status: 500 }
            )
          )
        }
      })

      child.on('error', (error: Error) => {
        resolve(
          NextResponse.json(
            {
              success: false,
              scenario,
              output,
              error: error.message,
            },
            { status: 500 }
          )
        )
      })

      setTimeout(() => {
        child.kill()
        resolve(
          NextResponse.json(
            {
              success: false,
              scenario,
              output,
              error: 'Test timed out after 5 minutes',
            },
            { status: 408 }
          )
        )
      }, 5 * 60 * 1000)
    })
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status !== 400 && status !== 401 && status !== 403) {
        return error
      }
      const code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST'

      let message = 'Request failed'
      try {
        const payload = (await error.clone().json()) as {
          error?: string | { message?: string }
          message?: string
        }
        if (typeof payload.error === 'object' && typeof payload.error?.message === 'string') {
          message = payload.error.message
        } else if (typeof payload.message === 'string') {
          message = payload.message
        } else if (typeof payload.error === 'string') {
          message = payload.error
        }
      } catch {
        try {
          const text = await error.clone().text()
          if (text.trim().length > 0) {
            message = text
          }
        } catch {
          // Keep default message if body cannot be parsed.
        }
      }

      return errorResponse(code, message, status)
    }
    console.error('Load test API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

function extractMetric(lines: string[], label: string): number | undefined {
  const line = lines.find((l) => l.includes(label))
  if (!line) return undefined

  const match = line.match(/(\d+(?:,\d+)*(?:\.\d+)?)/)
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''))
  }

  return undefined
}
