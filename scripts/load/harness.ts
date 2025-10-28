import { RequestMetrics, ScenarioMetrics, calculateMetrics, writeCSV, writeJSON, ensureOutputDir, formatDuration, formatThroughput } from './util'

export interface LoadTestConfig {
  baseURL: string
  concurrency: number
  durationSec: number
  targetRps?: number
  headers?: Record<string, string>
  method: string
  url: string
  body?: string
  label: string
}

export interface LoadTestResult {
  config: LoadTestConfig
  metrics: ScenarioMetrics
  csvPath: string
  jsonPath: string
}

export class LoadTestHarness {
  private config: LoadTestConfig
  private requests: RequestMetrics[] = []
  private startTime: number = 0
  private endTime: number = 0
  private isRunning: boolean = false

  constructor(config: LoadTestConfig) {
    this.config = config
  }

  async run(): Promise<LoadTestResult> {
    console.log(`🚀 Starting load test: ${this.config.label}`)
    console.log(`   URL: ${this.config.baseURL}${this.config.url}`)
    console.log(`   Concurrency: ${this.config.concurrency}`)
    console.log(`   Duration: ${this.config.durationSec}s`)
    console.log(`   Target RPS: ${this.config.targetRps || 'unlimited'}`)
    console.log()

    this.isRunning = true
    this.startTime = Date.now()
    this.endTime = this.startTime + (this.config.durationSec * 1000)

    // Start concurrent workers
    const workers = Array.from({ length: this.config.concurrency }, (_, i) => 
      this.worker(i)
    )

    // Wait for all workers to complete
    await Promise.all(workers)

    this.isRunning = false

    // Calculate metrics
    const metrics: ScenarioMetrics = {
      scenario: this.config.label,
      ...calculateMetrics(this.requests),
      requests: this.requests
    }

    // Write artifacts
    const outputDir = ensureOutputDir()
    const csvPath = writeCSV(metrics, outputDir)
    const jsonPath = writeJSON(metrics, outputDir)

    // Print summary
    this.printSummary(metrics)

    return {
      config: this.config,
      metrics,
      csvPath,
      jsonPath
    }
  }

  private async worker(workerId: number): Promise<void> {
    const requestInterval = this.config.targetRps 
      ? 1000 / (this.config.targetRps / this.config.concurrency)
      : 0

    while (this.isRunning && Date.now() < this.endTime) {
      const requestStart = Date.now()
      
      try {
        const response = await this.makeRequest()
        const requestEnd = Date.now()
        const latencyMs = requestEnd - requestStart

        const metrics: RequestMetrics = {
          status: response.status,
          latencyMs,
          rateLimitLimit: response.headers.get('X-RateLimit-Limit') || undefined,
          rateLimitRemaining: response.headers.get('X-RateLimit-Remaining') || undefined,
          retryAfter: response.headers.get('Retry-After') || undefined,
          responseSize: response.headers.get('Content-Length') ? 
            parseInt(response.headers.get('Content-Length')!) : 0,
          timestamp: requestStart
        }

        this.requests.push(metrics)

        // Log sample requests
        if (this.requests.length % 10 === 0) {
          console.log(`[Worker ${workerId}] ${response.status} ${latencyMs}ms | X-RateLimit: ${metrics.rateLimitLimit}/${metrics.rateLimitRemaining}${metrics.retryAfter ? ` | Retry-After: ${metrics.retryAfter}` : ''}`)
        }

      } catch (error) {
        const requestEnd = Date.now()
        const latencyMs = requestEnd - requestStart

        const metrics: RequestMetrics = {
          status: 0, // Network error
          latencyMs,
          responseSize: 0,
          timestamp: requestStart
        }

        this.requests.push(metrics)
        console.error(`[Worker ${workerId}] Request failed:`, error)
      }

      // Rate limiting
      if (requestInterval > 0) {
        await this.sleep(requestInterval)
      } else {
        // No rate limiting - fire as fast as possible
        await this.sleep(1)
      }
    }
  }

  private async makeRequest(): Promise<Response> {
    const url = `${this.config.baseURL}${this.config.url}`
    
    const options: RequestInit = {
      method: this.config.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LootAura-LoadTest/1.0',
        ...this.config.headers
      }
    }

    if (this.config.body) {
      options.body = this.config.body
    }

    return fetch(url, options)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private printSummary(metrics: ScenarioMetrics): void {
    console.log()
    console.log('📊 Load Test Summary')
    console.log('=' .repeat(50))
    console.log(`Scenario: ${metrics.scenario}`)
    console.log(`Total Requests: ${metrics.totalRequests}`)
    console.log(`Success Rate: ${metrics.successRate.toFixed(1)}%`)
    console.log(`429 Errors: ${metrics.error429Count}`)
    console.log(`Median Latency: ${formatDuration(metrics.medianLatencyMs)}`)
    console.log(`95th Percentile: ${formatDuration(metrics.p95LatencyMs)}`)
    
    if (metrics.timeToFirst429Sec) {
      console.log(`Time to First 429: ${metrics.timeToFirst429Sec.toFixed(1)}s`)
    }
    
    if (metrics.burstWindowSec) {
      console.log(`Burst Window: ${metrics.burstWindowSec}s`)
    }
    
    console.log(`Sustained Throughput: ${formatThroughput(metrics.sustainedThroughputRps)}`)
    console.log()
  }
}

export async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  const harness = new LoadTestHarness(config)
  return harness.run()
}
