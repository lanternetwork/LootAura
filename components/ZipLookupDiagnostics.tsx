'use client'

import { useState } from 'react'

interface DiagnosticStep {
  step: string
  success: boolean
  duration: number
  details?: any
  error?: string
}

interface ZipDiagnosticResult {
  zip: string
  timestamp: number
  overallSuccess: boolean
  steps: DiagnosticStep[]
  totalDuration: number
}

export default function ZipLookupDiagnostics() {
  const [testZip, setTestZip] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<ZipDiagnosticResult[]>([])

  const runDiagnostic = async (zip: string) => {
    const startTime = Date.now()
    const steps: DiagnosticStep[] = []
    
    const addStep = (step: string, success: boolean, details?: any, error?: string) => {
      const stepDuration = Date.now() - startTime
      steps.push({
        step,
        success,
        duration: stepDuration,
        details,
        error
      })
    }

    try {
      console.log(`[ZIP_DIAGNOSTIC] Starting comprehensive diagnostic for ZIP: ${zip}`)
      
      // Step 1: Validate ZIP format
      const zipRegex = /^\d{5}(-\d{4})?$/
      const isValidFormat = zipRegex.test(zip)
      addStep('ZIP Format Validation', isValidFormat, { regex: zipRegex.source }, 
        isValidFormat ? undefined : 'Invalid ZIP format')
      
      if (!isValidFormat) {
        throw new Error('Invalid ZIP format')
      }

      // Step 2: Test API endpoint availability
      let apiResponse: Response
      try {
        const apiStart = Date.now()
        apiResponse = await fetch(`/api/geocoding/zip?zip=${encodeURIComponent(zip)}`)
        const apiDuration = Date.now() - apiStart
        addStep('API Endpoint Call', apiResponse.ok, { 
          status: apiResponse.status, 
          statusText: apiResponse.statusText,
          duration: apiDuration 
        }, apiResponse.ok ? undefined : `HTTP ${apiResponse.status}`)
      } catch (error: any) {
        addStep('API Endpoint Call', false, undefined, error.message)
        throw error
      }

      // Step 3: Parse response
      let responseData: any
      try {
        responseData = await apiResponse.json()
        addStep('Response Parsing', true, { 
          hasData: !!responseData,
          dataKeys: Object.keys(responseData || {})
        })
      } catch (error: any) {
        addStep('Response Parsing', false, undefined, error.message)
        throw error
      }

      // Step 4: Validate response structure
      const hasRequiredFields = responseData && 
        typeof responseData.lat === 'number' && 
        typeof responseData.lng === 'number' &&
        typeof responseData.city === 'string' &&
        typeof responseData.state === 'string'
      
      addStep('Response Structure Validation', hasRequiredFields, {
        hasLat: typeof responseData?.lat === 'number',
        hasLng: typeof responseData?.lng === 'number',
        hasCity: typeof responseData?.city === 'string',
        hasState: typeof responseData?.state === 'string',
        hasBbox: Array.isArray(responseData?.bbox)
      }, hasRequiredFields ? undefined : 'Missing required fields')

      // Step 5: Validate coordinate values
      const coordsValid = hasRequiredFields && 
        !isNaN(responseData.lat) && 
        !isNaN(responseData.lng) &&
        responseData.lat >= -90 && responseData.lat <= 90 &&
        responseData.lng >= -180 && responseData.lng <= 180
      
      addStep('Coordinate Validation', coordsValid, {
        lat: responseData?.lat,
        lng: responseData?.lng,
        latValid: responseData?.lat >= -90 && responseData?.lat <= 90,
        lngValid: responseData?.lng >= -180 && responseData?.lng <= 180
      }, coordsValid ? undefined : 'Invalid coordinate values')

      // Step 6: Test bbox if present
      if (responseData.bbox && Array.isArray(responseData.bbox)) {
        const bboxValid = responseData.bbox.length === 4 && 
          responseData.bbox.every((val: any) => typeof val === 'number' && !isNaN(val))
        addStep('Bbox Validation', bboxValid, {
          bbox: responseData.bbox,
          length: responseData.bbox.length,
          allNumbers: responseData.bbox.every((val: any) => typeof val === 'number')
        }, bboxValid ? undefined : 'Invalid bbox format')
      } else {
        addStep('Bbox Validation', true, { bbox: 'Not provided' })
      }

      // Step 7: Test data consistency
      const dataConsistent = responseData.ok === true && 
        responseData.lat && responseData.lng && 
        responseData.city && responseData.state
      
      addStep('Data Consistency Check', dataConsistent, {
        ok: responseData.ok,
        hasCoordinates: !!(responseData.lat && responseData.lng),
        hasLocation: !!(responseData.city && responseData.state)
      }, dataConsistent ? undefined : 'Data inconsistency detected')

      const totalDuration = Date.now() - startTime
      const overallSuccess = steps.every(step => step.success)

      const result: ZipDiagnosticResult = {
        zip,
        timestamp: Date.now(),
        overallSuccess,
        steps,
        totalDuration
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.log(`[ZIP_DIAGNOSTIC] Completed diagnostic for ${zip}:`, result)

      return result

    } catch (error: any) {
      const totalDuration = Date.now() - startTime
      addStep('Overall Process', false, undefined, error.message)
      
      const result: ZipDiagnosticResult = {
        zip,
        timestamp: Date.now(),
        overallSuccess: false,
        steps,
        totalDuration
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.error(`[ZIP_DIAGNOSTIC] Error for ${zip}:`, error)
      
      return result
    }
  }

  const runSingleDiagnostic = async () => {
    if (!testZip.trim()) return
    
    setIsRunning(true)
    try {
      await runDiagnostic(testZip.trim())
    } finally {
      setIsRunning(false)
    }
  }

  const runComprehensiveTest = async () => {
    const testZips = [
      '40204', // Louisville, KY - should work
      '10001', // New York, NY - should work  
      '12345', // Invalid - should fail
      '90210-1234', // ZIP+4 - should work
      '99999', // Invalid - should fail
      '00000', // Edge case - might fail
      '12345-6789', // ZIP+4 - should work
      '60601', // Chicago, IL - should work
    ]
    
    setIsRunning(true)
    setResults([])
    
    for (const zip of testZips) {
      await runDiagnostic(zip)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    setIsRunning(false)
  }

  const clearResults = () => {
    setResults([])
  }

  const getSuccessRate = () => {
    if (results.length === 0) return 0
    const successful = results.filter(r => r.overallSuccess).length
    return Math.round((successful / results.length) * 100)
  }

  const getAverageDuration = () => {
    if (results.length === 0) return 0
    const total = results.reduce((sum, r) => sum + r.totalDuration, 0)
    return Math.round(total / results.length)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">ZIP Lookup Diagnostics</h3>
      <p className="text-sm text-gray-600 mb-6">
        Comprehensive testing of the entire ZIP lookup flow including validation, API calls, and data structure verification.
      </p>
      
      {/* Test Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={testZip}
            onChange={(e) => setTestZip(e.target.value)}
            placeholder="Enter ZIP code for diagnostic..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRunning}
          />
          <button
            onClick={runSingleDiagnostic}
            disabled={isRunning || !testZip.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? 'Running...' : 'Run Diagnostic'}
          </button>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={runComprehensiveTest}
            disabled={isRunning}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comprehensive Test (8 ZIPs)
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
            <div className="text-sm text-gray-600">Total Diagnostics</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{getSuccessRate()}%</div>
            <div className="text-sm text-gray-600">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{getAverageDuration()}ms</div>
            <div className="text-sm text-gray-600">Avg Duration</div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Diagnostic Results ({results.length})</h4>
        
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm">No diagnostic results yet. Run a diagnostic to see detailed results here.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={`${result.zip}-${result.timestamp}`}
                className={`p-4 rounded-lg border ${
                  result.overallSuccess 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{result.zip}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result.overallSuccess 
                        ? 'bg-green-200 text-green-800' 
                        : 'bg-red-200 text-red-800'
                    }`}>
                      {result.overallSuccess ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.totalDuration}ms
                  </div>
                </div>
                
                <div className="space-y-2">
                  {result.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        step.success ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className="flex-1">{step.step}</span>
                      <span className="text-xs text-gray-500">{step.duration}ms</span>
                    </div>
                  ))}
                </div>
                
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(result.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
