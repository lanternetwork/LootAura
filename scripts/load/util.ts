import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface RequestMetrics {
  status: number
  latencyMs: number
  rateLimitLimit?: string
  rateLimitRemaining?: string
  retryAfter?: string
  responseSize: number
  timestamp: number
}

export interface ScenarioMetrics {
  scenario: string
  totalRequests: number
  successCount: number
  error429Count: number
  successRate: number
  medianLatencyMs: number
  p95LatencyMs: number
  timeToFirst429Sec?: number
  burstWindowSec?: number
  sustainedThroughputRps: number
  requests: RequestMetrics[]
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

export function calculateMetrics(requests: RequestMetrics[]): Omit<ScenarioMetrics, 'requests'> {
  const totalRequests = requests.length
  const successCount = requests.filter(r => r.status >= 200 && r.status < 300).length
  const error429Count = requests.filter(r => r.status === 429).length
  const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0
  
  const successRequests = requests.filter(r => r.status >= 200 && r.status < 300)
  const latencies = successRequests.map(r => r.latencyMs)
  const medianLatencyMs = calculatePercentile(latencies, 50)
  const p95LatencyMs = calculatePercentile(latencies, 95)
  
  // Find time to first 429
  const first429 = requests.find(r => r.status === 429)
  const timeToFirst429Sec = first429 ? (first429.timestamp - requests[0].timestamp) / 1000 : undefined
  
  // Calculate burst window (first second where 429 appears)
  let burstWindowSec: number | undefined
  if (first429) {
    const first429Time = first429.timestamp
    const firstSecond = requests[0].timestamp
    burstWindowSec = Math.ceil((first429Time - firstSecond) / 1000)
  }
  
  // Calculate sustained throughput before throttling
  const preThrottleRequests = requests.filter(r => r.timestamp < (first429?.timestamp || Infinity))
  const durationSec = totalRequests > 0 ? (requests[requests.length - 1].timestamp - requests[0].timestamp) / 1000 : 0
  const sustainedThroughputRps = durationSec > 0 ? preThrottleRequests.length / durationSec : 0
  
  return {
    scenario: '',
    totalRequests,
    successCount,
    error429Count,
    successRate,
    medianLatencyMs,
    p95LatencyMs,
    timeToFirst429Sec,
    burstWindowSec,
    sustainedThroughputRps
  }
}

export function writeCSV(metrics: ScenarioMetrics, outputDir: string): string {
  const filename = `load-test-${metrics.scenario}-${Date.now()}.csv`
  const filepath = join(outputDir, filename)
  
  const headers = [
    'timestamp',
    'status',
    'latencyMs',
    'rateLimitLimit',
    'rateLimitRemaining',
    'retryAfter',
    'responseSize'
  ].join(',')
  
  const rows = metrics.requests.map(req => [
    req.timestamp,
    req.status,
    req.latencyMs,
    req.rateLimitLimit || '',
    req.rateLimitRemaining || '',
    req.retryAfter || '',
    req.responseSize
  ].join(','))
  
  const csvContent = [headers, ...rows].join('\n')
  writeFileSync(filepath, csvContent)
  
  return filepath
}

export function writeJSON(metrics: ScenarioMetrics, outputDir: string): string {
  const filename = `load-test-${metrics.scenario}-${Date.now()}.json`
  const filepath = join(outputDir, filename)
  
  writeFileSync(filepath, JSON.stringify(metrics, null, 2))
  
  return filepath
}

export function ensureOutputDir(): string {
  const outputDir = '/tmp/lootaura-load'
  try {
    mkdirSync(outputDir, { recursive: true })
  } catch (error) {
    // Fallback to local directory if /tmp doesn't work
    const fallbackDir = join(process.cwd(), 'load-test-results')
    mkdirSync(fallbackDir, { recursive: true })
    return fallbackDir
  }
  return outputDir
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function formatThroughput(rps: number): string {
  return `${rps.toFixed(1)} req/s`
}
