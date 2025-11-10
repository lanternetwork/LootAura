'use client'

import { useState, useCallback, useRef } from 'react'
import SimpleMap from '@/components/location/SimpleMap'

interface AttributionTestResult {
  name: string
  success: boolean
  details: Record<string, any>
  error?: string
  duration: number
  category: string
}

export default function OSMAttributionDiagnostics() {
  const [results, setResults] = useState<AttributionTestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const testMapRef = useRef<HTMLDivElement>(null)

  const addTest = useCallback((
    name: string, 
    success: boolean, 
    details: Record<string, any>, 
    error?: string, 
    category: string = 'attribution',
    testStartTime?: number
  ) => {
    const duration = testStartTime ? Date.now() - testStartTime : 0
    setResults(prev => [...prev, { name, success, details, error, duration, category }])
  }, [])

  const runDiagnostics = useCallback(async () => {
    setIsRunning(true)
    setResults([])
    
    console.log('[OSM_ATTRIBUTION_DIAG] Starting OSM attribution diagnostics...')
    
    try {
      // Wait a bit for the map to render
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Test 1: Check if AttributionOSM component exists in DOM
      const componentTestStart = Date.now()
      let componentExists = false
      let componentDetails: Record<string, any> = {}
      
      try {
        // Search for attribution element by text content
        const allElements = Array.from(document.querySelectorAll('*'))
        const attributionText = allElements.find(el => 
          el.textContent?.includes('OpenStreetMap') || el.textContent?.includes('OpenStreetMap contributors')
        )
        
        componentExists = !!attributionText
        componentDetails = {
          foundInDOM: componentExists,
          searchMethod: 'textContent search',
          elementType: attributionText?.tagName || 'not found',
          elementText: attributionText?.textContent?.substring(0, 50) || 'not found',
          elementRole: (attributionText as HTMLElement)?.getAttribute('role') || 'not found',
          elementClassName: (attributionText as HTMLElement)?.className || 'not found'
        }
      } catch (e) {
        console.log('Component existence test failed:', e)
        componentDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('AttributionOSM Component in DOM', componentExists, componentDetails, 
        componentExists ? undefined : 'AttributionOSM component not found in DOM', 'component', componentTestStart)

      // Test 2: Check visibility and computed styles
      const visibilityTestStart = Date.now()
      let isVisible = false
      let visibilityDetails: Record<string, any> = {}
      
      try {
        const attributionElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.includes('OpenStreetMap')
        )
        
        if (attributionElements.length > 0) {
          const element = attributionElements[0] as HTMLElement
          const computedStyle = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          
          isVisible = computedStyle.display !== 'none' && 
                     computedStyle.visibility !== 'hidden' && 
                     computedStyle.opacity !== '0' &&
                     rect.width > 0 && 
                     rect.height > 0
          
          visibilityDetails = {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
            zIndex: computedStyle.zIndex,
            position: computedStyle.position
          }
        } else {
          visibilityDetails = { error: 'No attribution element found' }
        }
      } catch (e) {
        console.log('Visibility test failed:', e)
        visibilityDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Attribution Visibility & Styles', isVisible, visibilityDetails, 
        isVisible ? undefined : 'Attribution element not visible or has zero dimensions', 'visibility', visibilityTestStart)

      // Test 3: Check parent container overflow
      const overflowTestStart = Date.now()
      let overflowOk = false
      let overflowDetails: Record<string, any> = {}
      
      try {
        const attributionElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.includes('OpenStreetMap')
        )
        
        if (attributionElements.length > 0) {
          let current: HTMLElement | null = attributionElements[0] as HTMLElement
          const parentChain: Array<{ element: string, overflow: string, position: string }> = []
          
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current)
            parentChain.push({
              element: current.tagName + (current.className ? `.${current.className.split(' ')[0]}` : ''),
              overflow: `${style.overflow} / ${style.overflowX} / ${style.overflowY}`,
              position: style.position
            })
            
            if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') {
              overflowOk = false
              break
            }
            
            current = current.parentElement
          }
          
          if (parentChain.length > 0 && !parentChain.some(p => p.overflow.includes('hidden'))) {
            overflowOk = true
          }
          
          overflowDetails = {
            parentChainLength: parentChain.length,
            parentChain: parentChain.slice(0, 5), // First 5 parents
            hasOverflowHidden: parentChain.some(p => p.overflow.includes('hidden'))
          }
        } else {
          overflowDetails = { error: 'No attribution element found' }
        }
      } catch (e) {
        console.log('Overflow test failed:', e)
        overflowDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Parent Container Overflow', overflowOk, overflowDetails, 
        overflowOk ? undefined : 'Parent container has overflow:hidden that may clip attribution', 'overflow', overflowTestStart)

      // Test 4: Check z-index stacking
      const zIndexTestStart = Date.now()
      let zIndexOk = false
      let zIndexDetails: Record<string, any> = {}
      
      try {
        const attributionElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.includes('OpenStreetMap')
        )
        
        if (attributionElements.length > 0) {
          const element = attributionElements[0] as HTMLElement
          const rect = element.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          
          const topElement = document.elementFromPoint(centerX, centerY)
          const attributionZIndex = parseInt(window.getComputedStyle(element).zIndex) || 0
          
          zIndexOk = topElement === element || topElement?.contains(element) || topElement?.closest('[role="contentinfo"]') === element
          
          zIndexDetails = {
            attributionZIndex: window.getComputedStyle(element).zIndex,
            attributionZIndexParsed: attributionZIndex,
            topElementAtPoint: topElement?.tagName + (topElement?.className ? `.${topElement.className.split(' ')[0]}` : ''),
            topElementText: topElement?.textContent?.substring(0, 30) || '',
            isAttributionOnTop: topElement === element || topElement?.contains(element)
          }
        } else {
          zIndexDetails = { error: 'No attribution element found' }
        }
      } catch (e) {
        console.log('Z-index test failed:', e)
        zIndexDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Z-Index Stacking', zIndexOk, zIndexDetails, 
        zIndexOk ? undefined : 'Attribution may be covered by another element', 'zindex', zIndexTestStart)

      // Test 5: Check position classes
      const positionTestStart = Date.now()
      let positionOk = false
      let positionDetails: Record<string, any> = {}
      
      try {
        const attributionElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.includes('OpenStreetMap')
        )
        
        if (attributionElements.length > 0) {
          const element = attributionElements[0] as HTMLElement
          const rect = element.getBoundingClientRect()
          const container = element.closest('[class*="relative"]') || element.parentElement
          const containerRect = container?.getBoundingClientRect()
          
          if (containerRect) {
            const distanceFromRight = containerRect.right - rect.right
            const distanceFromBottom = containerRect.bottom - rect.bottom
            const distanceFromTop = rect.top - containerRect.top
            const distanceFromLeft = rect.left - containerRect.left
            
            // Check if it's positioned near a corner (within 24px)
            const isNearCorner = 
              (distanceFromRight <= 24 && distanceFromBottom <= 24) || // bottom-right
              (distanceFromRight <= 24 && distanceFromTop <= 24) ||    // top-right
              (distanceFromLeft <= 24 && distanceFromTop <= 24) ||     // top-left
              (distanceFromLeft <= 24 && distanceFromBottom <= 24)      // bottom-left
            
            positionOk = isNearCorner
            
            positionDetails = {
              elementRect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
              containerRect: { top: containerRect.top, right: containerRect.right, bottom: containerRect.bottom, left: containerRect.left },
              distances: {
                fromRight: distanceFromRight,
                fromBottom: distanceFromBottom,
                fromTop: distanceFromTop,
                fromLeft: distanceFromLeft
              },
              isNearCorner,
              className: element.className,
              position: window.getComputedStyle(element).position
            }
          } else {
            positionDetails = { error: 'Could not find container' }
          }
        } else {
          positionDetails = { error: 'No attribution element found' }
        }
      } catch (e) {
        console.log('Position test failed:', e)
        positionDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Attribution Position', positionOk, positionDetails, 
        positionOk ? undefined : 'Attribution not positioned near a corner', 'position', positionTestStart)

      // Test 6: Check SimpleMap props
      const propsTestStart = Date.now()
      let propsOk = false
      let propsDetails: Record<string, any> = {}
      
      try {
        // Check if SimpleMap is rendering with correct props
        // We'll check the test map in this component
        const testMapContainer = testMapRef.current
        if (testMapContainer) {
          const mapContainer = testMapContainer.querySelector('[class*="relative"]')
          const allElements = Array.from(mapContainer?.querySelectorAll('*') || [])
          const attributionInTestMap = allElements.find(el => 
            el.textContent?.includes('OpenStreetMap') || el.textContent?.includes('OpenStreetMap contributors')
          )
          
          propsOk = !!attributionInTestMap
          propsDetails = {
            testMapContainerFound: !!testMapContainer,
            mapContainerFound: !!mapContainer,
            attributionInTestMap: !!attributionInTestMap,
            testMapProps: {
              showOSMAttribution: true, // We're passing this
              attributionPosition: 'bottom-right' // We're passing this
            }
          }
        } else {
          propsDetails = { error: 'Test map container not found' }
        }
      } catch (e) {
        console.log('Props test failed:', e)
        propsDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('SimpleMap Props & Rendering', propsOk, propsDetails, 
        propsOk ? undefined : 'SimpleMap may not be rendering attribution with correct props', 'props', propsTestStart)

      // Test 7: Check pointer events
      const pointerEventsTestStart = Date.now()
      let pointerEventsOk = false
      let pointerEventsDetails: Record<string, any> = {}
      
      try {
        const attributionElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.includes('OpenStreetMap')
        )
        
        if (attributionElements.length > 0) {
          const element = attributionElements[0] as HTMLElement
          const link = element.querySelector('a[href*="openstreetmap.org"]') as HTMLAnchorElement
          
          if (link) {
            const linkStyle = window.getComputedStyle(link)
            const parentStyle = window.getComputedStyle(element)
            
            pointerEventsOk = linkStyle.pointerEvents !== 'none' && parentStyle.pointerEvents !== 'auto'
            
            pointerEventsDetails = {
              linkPointerEvents: linkStyle.pointerEvents,
              parentPointerEvents: parentStyle.pointerEvents,
              linkIsClickable: linkStyle.pointerEvents !== 'none',
              parentAllowsClick: parentStyle.pointerEvents === 'none' || parentStyle.pointerEvents === 'auto'
            }
          } else {
            pointerEventsDetails = { error: 'No link found in attribution' }
          }
        } else {
          pointerEventsDetails = { error: 'No attribution element found' }
        }
      } catch (e) {
        console.log('Pointer events test failed:', e)
        pointerEventsDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pointer Events Configuration', pointerEventsOk, pointerEventsDetails, 
        pointerEventsOk ? undefined : 'Pointer events may not be configured correctly', 'pointer', pointerEventsTestStart)

    } catch (error) {
      console.error('[OSM_ATTRIBUTION_DIAG] Error running diagnostics:', error)
      addTest('Diagnostics Error', false, {}, 
        error instanceof Error ? error.message : String(error), 'error', Date.now())
    } finally {
      setIsRunning(false)
    }
  }, [addTest])

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">OSM Attribution Overlay Diagnostics</h3>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isRunning ? 'Running...' : 'Run Diagnostics'}
          </button>
          {totalCount > 0 && (
            <div className="text-sm">
              <span className="font-medium">Success Rate: </span>
              <span className={successRate === 100 ? 'text-green-600' : successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                {successRate}% ({successCount}/{totalCount})
              </span>
            </div>
          )}
        </div>

        {/* Test Map for Diagnostics */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">
            Test map with OSM attribution (bottom-right):
          </p>
          <div
            ref={testMapRef}
            className="relative w-full h-64 rounded-lg overflow-visible"
          >
            <SimpleMap
              center={{ lat: 38.2527, lng: -85.7585 }}
              zoom={10}
              attributionPosition="bottom-right"
              showOSMAttribution={true}
            />
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700">Test Results:</h4>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    result.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                      {result.success ? '✓' : '✗'} {result.name}
                    </span>
                    <span className="text-xs text-gray-500">{result.duration}ms</span>
                  </div>
                  {result.error && (
                    <div className="text-sm text-red-700 mb-1">{result.error}</div>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                      View Details
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p className="font-medium mb-1">What this diagnostic checks:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Component existence in DOM</li>
            <li>Visibility and computed styles</li>
            <li>Parent container overflow settings</li>
            <li>Z-index stacking context</li>
            <li>Position relative to container corners</li>
            <li>SimpleMap props configuration</li>
            <li>Pointer events configuration</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

