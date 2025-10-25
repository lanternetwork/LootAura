'use client'

import { useState } from 'react'

interface DiagnosticTestResult {
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
}

interface DiagnosticValidationResult {
  toolName: string
  overallSuccess: boolean
  tests: DiagnosticTestResult[]
  totalDuration: number
  issues: string[]
}

export default function DiagnosticToolsValidator() {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticValidationResult[]>([])
  const [currentTest, setCurrentTest] = useState<string>('')

  // Helper function to get current results
  const getCurrentResults = (toolElement: Element): Element[] => {
    // Look for result elements (divs with test results)
    const resultElements = Array.from(toolElement.querySelectorAll('div')).filter(div => {
      const text = div.textContent || ''
      return text.includes('PASS') || text.includes('FAIL') || text.includes('PASSED') || text.includes('FAILED') || 
             text.includes('SUCCESS') || text.includes('FAILED') || text.includes('ms') || text.includes('Test') ||
             text.includes('Total Tests') || text.includes('Success Rate') || text.includes('Response Time')
    })
    return resultElements
  }

  // Helper function to run a ZIP lookup test
  const runZipLookupTest = async (toolElement: Element, toolName: string) => {
    console.log(`[DIAGNOSTIC_VALIDATOR] Running ZIP lookup test for ${toolName}`)
    
    // Find the ZIP input field
    const zipInput = toolElement.querySelector('input[type="text"]') as HTMLInputElement
    if (!zipInput) {
      throw new Error('ZIP input field not found')
    }
    
    // Set a test ZIP code
    const testZip = '40204' // Louisville, KY
    zipInput.value = testZip
    
    // Trigger input event to update the component state
    zipInput.dispatchEvent(new Event('input', { bubbles: true }))
    
    // Find and click the test button
    const testButton = toolElement.querySelector('button') as HTMLButtonElement
    if (!testButton) {
      throw new Error('Test button not found')
    }
    
    // Click the test button
    testButton.click()
    
    // Wait a moment for the test to start
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  const runDiagnosticValidation = async (toolName: string) => {
    const startTime = Date.now()
    const tests: DiagnosticTestResult[] = []
    const issues: string[] = []

    const addTest = (testName: string, success: boolean, details: any, error?: string) => {
      tests.push({
        testName,
        success,
        duration: Date.now() - startTime,
        details,
        error
      })
      if (error) {
        issues.push(error)
      }
    }

    try {
      console.log(`[DIAGNOSTIC_VALIDATOR] Testing: ${toolName}`)
      setCurrentTest(toolName)

      // Find the diagnostic tool component
      const toolElement = findDiagnosticTool(toolName)
      if (!toolElement) {
        addTest('Component Found', false, {}, `Diagnostic tool "${toolName}" not found`)
        throw new Error(`Diagnostic tool "${toolName}" not found`)
      }

      addTest('Component Found', true, { 
        found: true,
        title: toolElement.querySelector('h3')?.textContent?.trim() || 'Unknown'
      })

      // Test 1: Check if it has a run button
      const runButton = findRunButton(toolElement)
      if (!runButton) {
        addTest('Has Run Button', false, {}, 'No run button found')
        throw new Error('No run button found')
      }

      addTest('Has Run Button', true, { 
        buttonText: runButton.textContent?.trim() || 'Unknown'
      })

      // Test 2: For ZIP tools, actually run a test; for others, just click run button
      const initialResults = getCurrentResults(toolElement);
      console.log(`[DIAGNOSTIC_VALIDATOR] Initial results for ${toolName}:`, initialResults.length);
      
      if (toolName.includes('ZIP Lookup')) {
        // For ZIP tools, we need to actually run a ZIP lookup test
        await runZipLookupTest(toolElement, toolName);
      } else {
        // For other tools, just click the run button
        (runButton as HTMLElement).click();
      }
      
      // Wait for results to appear (up to 10 seconds)
      const resultsAppeared = await waitForResults(toolElement, initialResults.length, 10000)
      if (!resultsAppeared) {
        addTest('Results Appear', false, {}, 'No results appeared after clicking run button')
        throw new Error('No results appeared after clicking run button')
      }

      addTest('Results Appear', true, {
        resultsCount: getCurrentResults(toolElement).length
      })

      // Test 3: Validate that results are meaningful (not just "PASS" or empty)
      const finalResults = getCurrentResults(toolElement)
      const meaningfulResults = validateResultsAreMeaningful(finalResults)
      
      addTest('Results Are Meaningful', meaningfulResults.isValid, {
        resultCount: finalResults.length,
        meaningfulCount: meaningfulResults.meaningfulCount,
        issues: meaningfulResults.issues
      }, meaningfulResults.isValid ? undefined : `Results not meaningful: ${meaningfulResults.issues.join(', ')}`)

      // Test 4: Check if results show real data (not hardcoded)
      const hasRealData = validateResultsHaveRealData(finalResults)
      addTest('Results Have Real Data', hasRealData.isValid, {
        hasRealData: hasRealData.hasRealData,
        hasTiming: hasRealData.hasTiming,
        hasDetails: hasRealData.hasDetails
      }, hasRealData.isValid ? undefined : `Results appear hardcoded: ${hasRealData.issues.join(', ')}`)

      const overallSuccess = tests.every(t => t.success)
      const totalDuration = Date.now() - startTime

      const result: DiagnosticValidationResult = {
        toolName,
        overallSuccess,
        tests,
        totalDuration,
        issues
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.log(`[DIAGNOSTIC_VALIDATOR] Completed testing ${toolName}:`, result)
      
      return result

    } catch (error) {
      const result: DiagnosticValidationResult = {
        toolName,
        overallSuccess: false,
        tests: [{
          testName: 'Component Detection',
          success: false,
          duration: Date.now() - startTime,
          details: { error: error instanceof Error ? error.message : String(error) },
          error: error instanceof Error ? error.message : String(error)
        }],
        totalDuration: Date.now() - startTime,
        issues: [error instanceof Error ? error.message : String(error)]
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.error(`[DIAGNOSTIC_VALIDATOR] Error testing ${toolName}:`, error)
      
      return result
    } finally {
      setCurrentTest('')
    }
  }

  // Helper function to find diagnostic tool by name
  const findDiagnosticTool = (toolName: string): Element | null => {
    // Look for h3 with the exact title
    const h3Elements = Array.from(document.querySelectorAll('h3'))
    const matchingH3 = h3Elements.find(h3 => h3.textContent?.trim() === toolName)
    
    if (matchingH3) {
      // Find the parent container (usually a div with bg-white rounded-lg)
      let container = matchingH3.parentElement
      while (container && !container.className.includes('bg-white')) {
        container = container.parentElement
      }
      return container
    }
    
    return null
  }

  // Helper function to find the run button
  const findRunButton = (toolElement: Element): Element | null => {
    const buttons = Array.from(toolElement.querySelectorAll('button'))
    return buttons.find(btn => {
      const text = btn.textContent?.toLowerCase() || ''
      return text.includes('run') || text.includes('test') || text.includes('diagnostic')
    }) || null
  }

  // Helper function to wait for results to appear
  const waitForResults = async (toolElement: Element, initialCount: number, timeoutMs: number): Promise<boolean> => {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      const currentResults = getCurrentResults(toolElement)
      if (currentResults.length > initialCount) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return false
  }

  // Helper function to validate results are meaningful
  const validateResultsAreMeaningful = (results: Element[]): { isValid: boolean; meaningfulCount: number; issues: string[] } => {
    const issues: string[] = []
    let meaningfulCount = 0

    results.forEach(result => {
      const text = result.textContent || ''
      
      // Check if result has actual content (not just "PASS" or "FAIL")
      if (text.length < 10) {
        issues.push('Result too short')
        return
      }
      
      // Check if result has timing or details
      if (text.includes('ms') || text.includes('Test') || text.includes('Duration')) {
        meaningfulCount++
      } else if (text.includes('PASS') || text.includes('FAIL')) {
        // Only count as meaningful if it has more than just PASS/FAIL
        if (text.length > 20) {
          meaningfulCount++
        } else {
          issues.push('Result appears to be just PASS/FAIL without details')
        }
      }
    })

    return {
      isValid: meaningfulCount > 0 && issues.length === 0,
      meaningfulCount,
      issues
    }
  }

  // Helper function to validate results have real data
  const validateResultsHaveRealData = (results: Element[]): { isValid: boolean; hasRealData: boolean; hasTiming: boolean; hasDetails: boolean; issues: string[] } => {
    const issues: string[] = []
    let hasRealData = false
    let hasTiming = false
    let hasDetails = false

    results.forEach(result => {
      const text = result.textContent || ''
      
      // Check for timing data (real tests should have timing)
      if (text.includes('ms') && /\d+ms/.test(text)) {
        hasTiming = true
        hasRealData = true
      }
      
      // Check for detailed information
      if (text.includes('Container:') || text.includes('Instance:') || text.includes('Style:')) {
        hasDetails = true
        hasRealData = true
      }
      
      // Check for suspicious patterns that suggest hardcoded results
      // Only flag 0ms if it's combined with PASS and there are many such results
      const zeroMsPassCount = results.filter(r => r.textContent?.includes('0ms') && r.textContent?.includes('PASS')).length
      if (zeroMsPassCount > 3) {
        issues.push('Multiple results showing 0ms timing suggests hardcoded results')
      }
      
      // Only flag 1ms timing if ALL results show 1ms AND there are many results
      const allOneMs = results.every(r => r.textContent?.includes('1ms'))
      if (allOneMs && results.length > 5) {
        issues.push('All results showing 1ms suggests hardcoded timing')
      }
    })

    return {
      isValid: hasRealData && issues.length === 0,
      hasRealData,
      hasTiming,
      hasDetails,
      issues
    }
  }

  const runComprehensiveValidation = async () => {
    setIsRunning(true)
    setResults([])
    
    const diagnosticTools = [
      'ZIP Lookup Testing Tool',
      'ZIP Lookup Diagnostics', 
      'Map Functionality Diagnostics',
      'Map Interaction Testing',
      'Map Pins Diagnostics'
    ]
    
    for (const tool of diagnosticTools) {
      await runDiagnosticValidation(tool)
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second between tests
    }
    
    setIsRunning(false)
  }

  const clearResults = () => {
    setResults([])
  }

  const getOverallSuccessRate = () => {
    if (results.length === 0) return 0
    const successful = results.filter(r => r.overallSuccess).length
    return Math.round((successful / results.length) * 100)
  }

  const getAverageDuration = () => {
    if (results.length === 0) return 0
    const total = results.reduce((sum, r) => sum + r.totalDuration, 0)
    return Math.round(total / results.length)
  }

  const _getTotalIssues = () => {
    return results.reduce((sum, r) => sum + r.issues.length, 0)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Diagnostic Tools Validator</h3>
      <p className="text-sm text-gray-600 mb-4">
        Tests the other diagnostic tools by actually running them and validating their output.
      </p>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={runComprehensiveValidation}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Testing...' : 'Run Comprehensive Validation'}
          </button>
          
          <button
            onClick={clearResults}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            Clear Results
          </button>
        </div>

        {currentTest && (
          <div className="text-sm text-blue-600">
            Currently testing: {currentTest}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{getOverallSuccessRate()}%</div>
                <div className="text-sm text-gray-600">Overall Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{results.length}</div>
                <div className="text-sm text-gray-600">Tools Tested</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{getAverageDuration()}ms</div>
                <div className="text-sm text-gray-600">Average Duration</div>
              </div>
            </div>

            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{result.toolName}</h4>
                    <span className={`px-2 py-1 rounded text-sm ${
                      result.overallSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {result.overallSuccess ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {result.tests.map((test, testIndex) => (
                      <div key={testIndex} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{test.testName}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            test.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {test.success ? 'PASS' : 'FAIL'}
                          </span>
                          <span className="text-gray-500">{test.duration}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {result.issues.length > 0 && (
                    <div className="mt-2 text-sm text-red-600">
                      Issues: {result.issues.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}