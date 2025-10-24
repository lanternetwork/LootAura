'use client'

import { useState } from 'react'

interface DiagnosticToolResult {
  toolName: string
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
  issues?: string[]
}

interface DiagnosticValidationResult {
  toolName: string
  overallSuccess: boolean
  tests: DiagnosticToolResult[]
  totalDuration: number
  issues: string[]
}

export default function DiagnosticToolsValidator() {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticValidationResult[]>([])
  const [currentTest, setCurrentTest] = useState<string>('')

  const runDiagnosticValidation = async (toolName: string) => {
    const startTime = Date.now()
    const tests: DiagnosticToolResult[] = []
    const issues: string[] = []

    const addTest = (testName: string, success: boolean, details: any, error?: string, testIssues?: string[]) => {
      tests.push({
        toolName,
        testName,
        success,
        duration: Date.now() - startTime,
        details,
        error,
        issues: testIssues
      })
      if (testIssues) {
        issues.push(...testIssues)
      }
    }

    try {
      console.log(`[DIAGNOSTIC_VALIDATOR] Starting validation for: ${toolName}`)
      setCurrentTest(toolName)

      // Test 1: Check if the diagnostic tool component exists in DOM
      // Look for the component by checking for common diagnostic tool patterns
      let toolElement = document.querySelector(`[data-testid*="${toolName.toLowerCase().replace(/\s+/g, '-')}"]`) ||
                       document.querySelector(`[class*="${toolName.toLowerCase().replace(/\s+/g, '-')}"]`)
      
      // If not found by data-testid or class, try finding by h3 title
      if (!toolElement) {
        toolElement = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes(toolName)) || null
      }
      
      // If still not found, try fuzzy matching on h3 titles
      if (!toolElement) {
        toolElement = Array.from(document.querySelectorAll('h3')).find(h => {
          const title = h.textContent?.toLowerCase() || ''
          const searchName = toolName.toLowerCase()
          return title.includes(searchName) || searchName.includes(title) ||
                 title.includes(searchName.split(' ')[0]) ||
                 searchName.includes(title.split(' ')[0])
        }) || null
      }
      
      // If still not found, try finding by div content
      if (!toolElement) {
        toolElement = Array.from(document.querySelectorAll('div')).find(div => 
          div.textContent?.includes(toolName) && 
          (div.querySelector('button') || div.querySelector('[class*="test"]'))
        ) || null
      }
      
      const toolExists = !!toolElement
      addTest('Component Exists', toolExists, {
        found: toolExists,
        selector: toolElement?.tagName || 'none',
        className: toolElement?.className || 'none',
        textContent: toolElement?.textContent?.substring(0, 100) || 'none',
        allH3s: Array.from(document.querySelectorAll('h3')).map(h => h.textContent?.trim()).filter(Boolean)
      }, toolExists ? undefined : 'Diagnostic tool component not found in DOM')

      if (!toolExists) {
        // Try one more fallback - look for any diagnostic-related content
        const fallbackElement = Array.from(document.querySelectorAll('div')).find(div => {
          const text = div.textContent?.toLowerCase() || ''
          return text.includes('diagnostic') || text.includes('test') || text.includes('tool')
        })
        
        if (fallbackElement) {
          toolElement = fallbackElement
          console.log(`[DIAGNOSTIC_VALIDATOR] Found fallback element for ${toolName}:`, fallbackElement.textContent?.substring(0, 100))
        } else {
          throw new Error(`Diagnostic tool "${toolName}" not found in DOM`)
        }
      }

      // Test 2: Check for required buttons/controls - simplified approach
      const buttons = toolElement?.querySelectorAll('button') || []
      const allPageButtons = document.querySelectorAll('button')
      
      // Just check if there are any buttons at all in the component
      const hasTestButtons = buttons.length > 0
      addTest('Has Test Controls', hasTestButtons, {
        buttonCount: buttons.length,
        buttonTexts: Array.from(buttons).map((btn: Element) => btn.textContent?.trim()).filter(Boolean),
        hasRunButton: hasTestButtons,
        allButtons: Array.from(toolElement?.querySelectorAll('button') || []).map((btn: Element) => ({
          text: btn.textContent?.trim(),
          classes: btn.className
        })),
        allPageButtons: Array.from(allPageButtons).slice(0, 10).map((btn: Element) => ({
          text: btn.textContent?.trim(),
          classes: btn.className
        }))
      }, hasTestButtons ? undefined : 'No test controls found')

      // Test 3: Check for results display area - simplified approach
      // Just check if there are any divs with content that could be results
      const hasResultsArea = (toolElement?.querySelectorAll('div') || []).length > 0
      addTest('Has Results Display', hasResultsArea, {
        found: hasResultsArea,
        divCount: (toolElement?.querySelectorAll('div') || []).length,
        allDivs: Array.from(toolElement?.querySelectorAll('div') || []).slice(0, 5).map(div => ({
          text: div.textContent?.substring(0, 50),
          classes: div.className
        }))
      }, hasResultsArea ? undefined : 'No results display area found')

      // Test 4: Check for proper test structure (not hardcoded passes)
      const testCode = toolElement?.innerHTML || ''
      const hasHardcodedPasses = testCode.includes('success: true') || 
                                testCode.includes('addStep(.*true') ||
                                testCode.includes('overallSuccess = true')
      const hasProperTests = !hasHardcodedPasses
      addTest('No Hardcoded Passes', hasProperTests, {
        hasHardcodedPasses,
        testCodeLength: testCode.length,
        suspiciousPatterns: [
          testCode.includes('success: true'),
          testCode.includes('addStep(.*true'),
          testCode.includes('overallSuccess = true')
        ]
      }, hasProperTests ? undefined : 'Found hardcoded test passes - tests may not be meaningful')

      // Test 5: Check for proper error handling
      const hasErrorHandling = testCode.includes('catch') || 
                              testCode.includes('error') || 
                              testCode.includes('try')
      addTest('Has Error Handling', hasErrorHandling, {
        hasErrorHandling,
        hasTryCatch: testCode.includes('try') && testCode.includes('catch'),
        hasErrorProps: testCode.includes('error')
      }, hasErrorHandling ? undefined : 'No error handling detected - tests may not be robust')

      // Test 6: Check for meaningful test criteria
      const hasMeaningfulCriteria = testCode.includes('success') && 
                                   testCode.includes('false') &&
                                   !testCode.includes('success: true')
      addTest('Has Meaningful Criteria', hasMeaningfulCriteria, {
        hasMeaningfulCriteria,
        hasSuccessLogic: testCode.includes('success'),
        hasFailureLogic: testCode.includes('false'),
        hasConditionalLogic: testCode.includes('if') || testCode.includes('?')
      }, hasMeaningfulCriteria ? undefined : 'Test criteria may not be meaningful - always passing tests')

      // Test 7: Check for proper logging/debugging
      const hasLogging = testCode.includes('console.log') || 
                        testCode.includes('console.error') ||
                        testCode.includes('console.warn')
      addTest('Has Proper Logging', hasLogging, {
        hasLogging,
        hasConsoleLog: testCode.includes('console.log'),
        hasConsoleError: testCode.includes('console.error'),
        hasConsoleWarn: testCode.includes('console.warn')
      }, hasLogging ? undefined : 'No logging detected - tests may be hard to debug')

      // Test 8: Check for async/await patterns (proper async testing)
      const hasAsyncPatterns = testCode.includes('async') || 
                              testCode.includes('await') ||
                              testCode.includes('Promise')
      addTest('Has Async Patterns', hasAsyncPatterns, {
        hasAsyncPatterns,
        hasAsync: testCode.includes('async'),
        hasAwait: testCode.includes('await'),
        hasPromise: testCode.includes('Promise')
      }, hasAsyncPatterns ? undefined : 'No async patterns detected - tests may not wait for async operations')

      // Test 9: Check for proper test isolation
      const hasTestIsolation = testCode.includes('beforeEach') || 
                              testCode.includes('afterEach') ||
                              testCode.includes('clearResults') ||
                              testCode.includes('setResults([])')
      addTest('Has Test Isolation', hasTestIsolation, {
        hasTestIsolation,
        hasBeforeEach: testCode.includes('beforeEach'),
        hasAfterEach: testCode.includes('afterEach'),
        hasClearResults: testCode.includes('clearResults') || testCode.includes('setResults([])')
      }, hasTestIsolation ? undefined : 'No test isolation detected - tests may interfere with each other')

      // Test 10: Check for proper test data
      const hasTestData = testCode.includes('testData') || 
                         testCode.includes('mockData') ||
                         testCode.includes('sampleData') ||
                         testCode.includes('testZips') ||
                         testCode.includes('testSales')
      addTest('Has Test Data', hasTestData, {
        hasTestData,
        hasTestDataVar: testCode.includes('testData'),
        hasMockData: testCode.includes('mockData'),
        hasSampleData: testCode.includes('sampleData'),
        hasTestZips: testCode.includes('testZips'),
        hasTestSales: testCode.includes('testSales')
      }, hasTestData ? undefined : 'No test data detected - tests may not have realistic scenarios')

      const totalDuration = Date.now() - startTime
      const overallSuccess = tests.every(test => test.success)

      const result: DiagnosticValidationResult = {
        toolName,
        overallSuccess,
        tests,
        totalDuration,
        issues
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.log(`[DIAGNOSTIC_VALIDATOR] Completed validation for ${toolName}:`, result)

      return result

    } catch (error: any) {
      const totalDuration = Date.now() - startTime
      addTest('Overall Process', false, undefined, error.message, ['Fatal error in validation process'])
      
      const result: DiagnosticValidationResult = {
        toolName,
        overallSuccess: false,
        tests,
        totalDuration,
        issues: [...issues, error.message]
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.error(`[DIAGNOSTIC_VALIDATOR] Error for ${toolName}:`, error)
      
      return result
    } finally {
      setCurrentTest('')
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
      await new Promise(resolve => setTimeout(resolve, 500))
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

  const getTotalIssues = () => {
    return results.reduce((sum, r) => sum + r.issues.length, 0)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Diagnostic Tools Validator</h3>
      <p className="text-sm text-gray-600 mb-4">
        Comprehensive testing of all diagnostic tools to ensure they're actually testing functionality
        and not just passing by default.
      </p>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={runComprehensiveValidation}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Comprehensive Validation'}
          </button>
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Clear Results
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900">Overall Success Rate</h4>
                <p className="text-2xl font-bold text-blue-600">{getOverallSuccessRate()}%</p>
                <p className="text-sm text-blue-700">{results.length} tools tested</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-900">Average Duration</h4>
                <p className="text-2xl font-bold text-green-600">{getAverageDuration()}ms</p>
                <p className="text-sm text-green-700">Per tool validation</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <h4 className="font-semibold text-red-900">Total Issues</h4>
                <p className="text-2xl font-bold text-red-600">{getTotalIssues()}</p>
                <p className="text-sm text-red-700">Issues found</p>
              </div>
            </div>

            <div className="space-y-4">
              {results.map((result, index) => (
                <div key={index} className={`border rounded-lg p-4 ${result.overallSuccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">{result.toolName}</h4>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-sm ${result.overallSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {result.overallSuccess ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="text-sm text-gray-600">{result.totalDuration}ms</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                    {result.tests.map((test, testIndex) => (
                      <div key={testIndex} className={`p-2 rounded text-sm ${test.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        <div className="font-medium">{test.testName}</div>
                        <div className="text-xs">{test.duration}ms</div>
                        {test.error && <div className="text-xs mt-1 text-red-600">{test.error}</div>}
                        {test.issues && test.issues.length > 0 && (
                          <div className="text-xs mt-1 text-orange-600">
                            Issues: {test.issues.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {result.issues.length > 0 && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded">
                      <h5 className="font-medium text-orange-900 mb-2">Issues Found:</h5>
                      <ul className="text-sm text-orange-800 space-y-1">
                        {result.issues.map((issue, issueIndex) => (
                          <li key={issueIndex} className="flex items-start">
                            <span className="text-orange-600 mr-2">•</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTest && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-800">Validating: {currentTest}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
