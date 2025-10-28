'use client'

import { useState } from 'react'

interface LoadTestResult {
  scenario: string
  status: 'idle' | 'running' | 'completed' | 'error'
  output: string[]
  error?: string
  duration?: number
  metrics?: {
    totalRequests: number
    successRate: number
    error429Count: number
    medianLatency: number
    timeToFirst429?: number
  }
}

const scenarios = [
  { id: 'sales-baseline', name: 'Sales Baseline', description: 'Normal usage patterns (5 concurrent, 10 RPS, 60s)' },
  { id: 'sales-burst', name: 'Sales Burst', description: 'Soft-then-hard limits (20 concurrent, 80 RPS, 45s)' },
  { id: 'sales-sustained', name: 'Sales Sustained', description: 'Long-term stability (10 concurrent, 40 RPS, 120s)' },
  { id: 'geo-cache-warmup', name: 'Geocoding Cache', description: 'Cache behavior (2 concurrent, 5 RPS, 30s)' },
  { id: 'geo-abuse', name: 'Geocoding Abuse', description: 'Rate limit enforcement (5 concurrent, 30 RPS, 30s)' },
  { id: 'auth-signin', name: 'Auth Signin', description: 'Login rate limiting (5 concurrent, 20 RPS, 30s)' },
  { id: 'auth-magic-link', name: 'Auth Magic Link', description: 'Magic link limiting (5 concurrent, 20 RPS, 30s)' },
  { id: 'mutation-sales', name: 'Mutation Sales', description: 'User-scoped limiting (2 concurrent, 6 RPS, 60s)' },
  { id: 'multi-ip-sales', name: 'Multi-IP Sales', description: 'IP isolation (10 concurrent, 50 RPS, 60s)' }
]

export default function LoadTestControls() {
  const [results, setResults] = useState<Record<string, LoadTestResult>>({})
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [baseURL, setBaseURL] = useState('http://localhost:3000')

  const runScenario = async (scenarioId: string) => {
    setResults(prev => ({
      ...prev,
      [scenarioId]: {
        scenario: scenarioId,
        status: 'running',
        output: [`Starting ${scenarioId} load test...`]
      }
    }))

    try {
      const startTime = Date.now()
      
      // Dispatch CI workflow to run load test in GitHub Actions
      const response = await fetch('/api/admin/load-test/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenario: scenarioId,
          baseURL: baseURL
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error || 'dispatch failed'}${data?.details ? ` — ${data.details}` : ''}`)
      }
      const duration = Date.now() - startTime

      setResults(prev => ({
        ...prev,
        [scenarioId]: {
          scenario: scenarioId,
          status: 'completed',
          output: [
            `${scenarioId} dispatched to CI`,
            data.actionsUrl ? `View in GitHub Actions: ${data.actionsUrl}` : 'Open Actions tab to view runs'
          ],
          duration,
          metrics: undefined
        }
      }))

    } catch (error) {
      setResults(prev => ({
        ...prev,
        [scenarioId]: {
          scenario: scenarioId,
          status: 'error',
          output: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }))
    }
  }

  const runAllScenarios = async () => {
    setIsRunningAll(true)
    
    // Run scenarios sequentially to avoid overwhelming the server
    for (const scenario of scenarios) {
      await runScenario(scenario.id)
      // Small delay between scenarios
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    setIsRunningAll(false)
  }

  const getStatusColor = (status: LoadTestResult['status']) => {
    switch (status) {
      case 'idle': return 'text-gray-500'
      case 'running': return 'text-blue-500'
      case 'completed': return 'text-green-500'
      case 'error': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusIcon = (status: LoadTestResult['status']) => {
    switch (status) {
      case 'idle': return '⏸️'
      case 'running': return '🔄'
      case 'completed': return '✅'
      case 'error': return '❌'
      default: return '⏸️'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Load Testing Controls</h3>
      
      {/* Configuration */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Base URL
        </label>
        <input
          type="text"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="http://localhost:3000"
        />
        <p className="text-xs text-gray-500 mt-1">
          Target URL for load testing (localhost for local testing, staging URL for staging)
        </p>
      </div>

      {/* Run All Button */}
      <div className="mb-6">
        <button
          onClick={runAllScenarios}
          disabled={isRunningAll}
          className={`px-4 py-2 rounded-md font-medium ${
            isRunningAll
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isRunningAll ? '🔄 Running All Tests...' : '🚀 Run All Load Tests'}
        </button>
        <p className="text-xs text-gray-500 mt-1">
          Runs all scenarios sequentially (may take several minutes)
        </p>
      </div>

      {/* Individual Scenario Controls */}
      <div className="space-y-4">
        <h4 className="text-md font-medium text-gray-800">Individual Scenarios</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((scenario) => {
            const result = results[scenario.id]
            const isRunning = result?.status === 'running'
            
            return (
              <div key={scenario.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-gray-800">{scenario.name}</h5>
                  <span className={`text-sm ${getStatusColor(result?.status || 'idle')}`}>
                    {getStatusIcon(result?.status || 'idle')} {result?.status || 'idle'}
                  </span>
                </div>
                
                <p className="text-xs text-gray-600 mb-3">{scenario.description}</p>
                
                <button
                  onClick={() => runScenario(scenario.id)}
                  disabled={isRunning || isRunningAll}
                  className={`w-full px-3 py-2 text-sm rounded-md font-medium ${
                    isRunning || isRunningAll
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isRunning ? 'Running...' : 'Run Test'}
                </button>

                {/* Results Display */}
                {result && result.status !== 'idle' && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    {result.error && (
                      <div className="text-red-600 text-xs mb-2">
                        Error: {result.error}
                      </div>
                    )}
                    
                    {result.metrics && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>Requests: {result.metrics.totalRequests}</div>
                        <div>Success Rate: {result.metrics.successRate.toFixed(1)}%</div>
                        <div>429 Errors: {result.metrics.error429Count}</div>
                        <div>Latency: {result.metrics.medianLatency}ms</div>
                        {result.metrics.timeToFirst429 && (
                          <div>Time to 429: {result.metrics.timeToFirst429.toFixed(1)}s</div>
                        )}
                        {result.duration && (
                          <div>Duration: {(result.duration / 1000).toFixed(1)}s</div>
                        )}
                      </div>
                    )}
                    
                    {result.output && result.output.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 cursor-pointer">View Output</summary>
                        <pre className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded max-h-32 overflow-auto">
                          {result.output.join('\n')}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      {Object.keys(results).length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-md font-medium text-blue-800 mb-2">Test Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-600 font-medium">Completed:</span>
              <span className="ml-1">
                {Object.values(results).filter(r => r.status === 'completed').length}
              </span>
            </div>
            <div>
              <span className="text-red-600 font-medium">Errors:</span>
              <span className="ml-1">
                {Object.values(results).filter(r => r.status === 'error').length}
              </span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">Running:</span>
              <span className="ml-1">
                {Object.values(results).filter(r => r.status === 'running').length}
              </span>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Total:</span>
              <span className="ml-1">{Object.keys(results).length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
