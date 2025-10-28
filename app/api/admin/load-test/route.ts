import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface LoadTestRequest {
  scenario: string
  baseURL?: string
  ip?: string
  userToken?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: LoadTestRequest = await request.json()
    const { scenario, baseURL = 'http://localhost:3000', ip, userToken } = body

    // Validate scenario
    const validScenarios = [
      'sales-baseline',
      'sales-burst', 
      'sales-sustained',
      'geo-cache-warmup',
      'geo-abuse',
      'auth-signin',
      'auth-magic-link',
      'mutation-sales',
      'multi-ip-sales'
    ]

    if (!validScenarios.includes(scenario)) {
      return NextResponse.json(
        { error: 'Invalid scenario', validScenarios },
        { status: 400 }
      )
    }

    // Build command arguments
    const args = [
      join(process.cwd(), 'scripts/load/cli.ts'),
      '--scenario', scenario,
      '--baseURL', baseURL
    ]

    if (ip) {
      args.push('--ip', ip)
    }

    if (userToken) {
      args.push('--userToken', userToken)
    }

    // Set production-like environment for local testing
    const env = {
      ...process.env,
      NODE_ENV: 'production' as const,
      RATE_LIMITING_ENABLED: 'true'
    }

    return new Promise<NextResponse>((resolve) => {
      const output: string[] = []
      let metrics: any = null

      const child = spawn('tsx', args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      }) as ChildProcess

      // Capture stdout
      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim())
        output.push(...lines)
      })

      // Capture stderr
      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim())
        output.push(...lines)
      })

      child.on('close', (code: number | null) => {
        if (code === 0) {
          // Parse metrics from output
          const summaryLine = output.find(line => line.includes('Load Test Summary'))
          if (summaryLine) {
            const summaryIndex = output.indexOf(summaryLine)
            const summaryLines = output.slice(summaryIndex, summaryIndex + 10)
            
            metrics = {
              totalRequests: extractMetric(summaryLines, 'Total Requests'),
              successRate: extractMetric(summaryLines, 'Success Rate'),
              error429Count: extractMetric(summaryLines, '429 Errors'),
              medianLatency: extractMetric(summaryLines, 'Median Latency'),
              timeToFirst429: extractMetric(summaryLines, 'Time to First 429')
            }
          }

          resolve(NextResponse.json({
            success: true,
            scenario,
            output,
            metrics,
            exitCode: code
          }))
        } else {
          resolve(NextResponse.json({
            success: false,
            scenario,
            output,
            error: `Process exited with code ${code}`,
            exitCode: code
          }, { status: 500 }))
        }
      })

      child.on('error', (error: Error) => {
        resolve(NextResponse.json({
          success: false,
          scenario,
          output,
          error: error.message
        }, { status: 500 }))
      })

      // Set a timeout to prevent hanging
      setTimeout(() => {
        child.kill()
        resolve(NextResponse.json({
          success: false,
          scenario,
          output,
          error: 'Test timed out after 5 minutes'
        }, { status: 408 }))
      }, 5 * 60 * 1000) // 5 minute timeout
    })

  } catch (error) {
    console.error('Load test API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function extractMetric(lines: string[], label: string): number | undefined {
  const line = lines.find(l => l.includes(label))
  if (!line) return undefined
  
  // Extract number from line like "Total Requests: 1,247"
  const match = line.match(/(\d+(?:,\d+)*(?:\.\d+)?)/)
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''))
  }
  
  return undefined
}
