'use client'

import { useState } from 'react'

interface ZipTestResult {
  zip: string
  timestamp: number
  success: boolean
  data?: any
  error?: string
  responseTime: number
  endpoint: string
  method: string
}

interface ZipLookupTesterProps {
  className?: string
}

export default function ZipLookupTester({ className = '' }: ZipLookupTesterProps) {
  const [testZip, setTestZip] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<ZipTestResult[]>([])
  const [selectedZip, setSelectedZip] = useState('')

  const testZipLookup = async (zip: string) => {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    
    try {
      console.log(`[ZIP_TEST] Starting test for ZIP: ${zip}`)
      
      const response = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(zip)}`)
      const data = await response.json()
      const responseTime = Date.now() - startTime
      
      const result: ZipTestResult = {
        zip,
        timestamp: Date.now(),
        success: response.ok && data.ok,
        data: data,
        error: !response.ok ? `HTTP ${response.status}: ${response.statusText}` : !data.ok ? data.error : undefined,
        responseTime,
        endpoint: '/api/geocoding/zip',
        method: 'GET'
      }
      
      setResults(prev => [result, ...prev].slice(0, 20)) // Keep last 20 results
      
      console.log(`[ZIP_TEST] Result for ${zip}:`, result)
      
      return result
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      const result: ZipTestResult = {
        zip,
        timestamp: Date.now(),
        success: false,
        error: error.message,
        responseTime,
        endpoint: '/api/geocoding/zip',
        method: 'GET'
      }
      
      setResults(prev => [result, ...prev].slice(0, 20))
      console.error(`[ZIP_TEST] Error for ${zip}:`, error)
      
      return result
    }
  }

  const runSingleTest = async () => {
    if (!testZip.trim()) return
    
    setIsRunning(true)
    try {
      await testZipLookup(testZip.trim())
    } finally {
      setIsRunning(false)
    }
  }

  const runBatchTest = async () => {
    const testZips = [
      '40204', // Louisville, KY
      '10001', // New York, NY
      '90210', // Beverly Hills, CA
      '60601', // Chicago, IL
      '33101', // Miami, FL
      '12345', // Invalid ZIP
      '99999', // Invalid ZIP
      '12345-6789', // ZIP+4 format
      '90210-1234', // ZIP+4 format
      '00000' // Edge case
    ]
    
    setIsRunning(true)
    setResults([]) // Clear previous results
    
    for (const zip of testZips) {
      await testZipLookup(zip)
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    setIsRunning(false)
  }

  const runStressTest = async () => {
    const randomZips = Array.from({ length: 10 }, () => {
      // Generate random 5-digit ZIP codes
      return Math.floor(Math.random() * 90000 + 10000).toString()
    })
    
    setIsRunning(true)
    setResults([])
    
    for (const zip of randomZips) {
      await testZipLookup(zip)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    setIsRunning(false)
  }

  const clearResults = () => {
    setResults([])
  }

  const getSuccessRate = () => {
    if (results.length === 0) return 0
    const successful = results.filter(r => r.success).length
    return Math.round((successful / results.length) * 100)
  }

  const getAverageResponseTime = () => {
    if (results.length === 0) return 0
    const total = results.reduce((sum, r) => sum + r.responseTime, 0)
    return Math.round(total / results.length)
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      <h3 className="text-lg font-semibold mb-4">ZIP Lookup Testing Tool</h3>
      
      {/* Test Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={testZip}
            onChange={(e) => setTestZip(e.target.value)}
            placeholder="Enter ZIP code to test..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRunning}
          />
          <button
            onClick={runSingleTest}
            disabled={isRunning || !testZip.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? 'Testing...' : 'Test ZIP'}
          </button>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runBatchTest}
            disabled={isRunning}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batch Test (10 ZIPs)
          </button>
          <button
            onClick={runStressTest}
            disabled={isRunning}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stress Test (10 Random)
          </button>
          <button
            onClick={clearResults}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Results
          </button>
        </div>
      </div>

      {/* Statistics */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{results.length}</div>
            <div className="text-sm text-gray-600">Total Tests</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{getSuccessRate()}%</div>
            <div className="text-sm text-gray-600">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{getAverageResponseTime()}ms</div>
            <div className="text-sm text-gray-600">Avg Response Time</div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900 mb-3">Test Results ({results.length})</h4>
        
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm">No test results yet. Run a test to see results here.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={`${result.zip}-${result.timestamp}`}
                className={`p-3 rounded-lg border ${
                  result.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{result.zip}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result.success 
                        ? 'bg-green-200 text-green-800' 
                        : 'bg-red-200 text-red-800'
                    }`}>
                      {result.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.responseTime}ms
                  </div>
                </div>
                
                {result.success && result.data ? (
                  <div className="text-sm text-gray-700">
                    <div><strong>City:</strong> {result.data.city || 'N/A'}</div>
                    <div><strong>State:</strong> {result.data.state || 'N/A'}</div>
                    <div><strong>Lat/Lng:</strong> {result.data.lat}, {result.data.lng}</div>
                    {result.data.bbox && (
                      <div><strong>Bbox:</strong> {JSON.stringify(result.data.bbox)}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    <div><strong>Error:</strong> {result.error}</div>
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(result.timestamp).toLocaleTimeString()} • {result.endpoint}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
