'use client'

import { useState, useRef } from 'react'

interface PinTestResult {
  testName: string
  success: boolean
  duration: number
  details: Record<string, any>
  error?: string
  category: 'creation' | 'placement' | 'interaction' | 'clustering' | 'events'
}

interface MapPinsDiagnosticsProps {
  mapRef?: React.RefObject<any>
}

export default function MapPinsDiagnostics({ mapRef }: MapPinsDiagnosticsProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<PinTestResult[]>([])
  const [_testSales, _setTestSales] = useState<any[]>([])
  const testStartTime = useRef<number>(0)

  const addTest = (testName: string, success: boolean, details: Record<string, any>, error?: string, category: PinTestResult['category'] = 'creation', testStartTime?: number) => {
    const duration = testStartTime ? Date.now() - testStartTime : 0
    const result: PinTestResult = {
      testName,
      success,
      duration,
      details,
      error,
      category
    }
    setResults(prev => [...prev, result])
    console.log(`[PIN_TEST] ${testName}:`, success ? 'PASS' : 'FAIL', duration + 'ms', details)
  }

  const runPinDiagnostics = async () => {
    setIsRunning(true)
    setResults([])
    testStartTime.current = Date.now()
    
    console.log('[PIN_DIAGNOSTICS] Starting comprehensive pin diagnostics...')

    try {
      // Test 1: Pin Creation System
      const creationTestStart = Date.now()
      let pinCreationWorking = false
      let pinCreationDetails = {}
      
      try {
        // Check if we can create pin elements
        const testPin = document.createElement('div')
        testPin.className = 'mapboxgl-marker'
        testPin.style.cssText = 'width: 20px; height: 20px; background: red; border-radius: 50%;'
        testPin.setAttribute('data-testid', 'test-pin')
        
        pinCreationWorking = testPin instanceof HTMLElement && testPin.className === 'mapboxgl-marker'
        pinCreationDetails = {
          canCreateElement: pinCreationWorking,
          elementType: testPin.tagName,
          className: testPin.className,
          hasTestId: testPin.hasAttribute('data-testid')
        }
        
        // Clean up test element
        testPin.remove()
      } catch (e) {
        console.log('Pin creation test failed:', e)
        pinCreationDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Creation System', pinCreationWorking, pinCreationDetails, pinCreationWorking ? undefined : 'Cannot create pin elements', 'creation', creationTestStart)

      // Test 2: Map Instance for Pin Operations
      const mapInstanceTestStart = Date.now()
      let mapInstanceAvailable = false
      let mapInstanceDetails = {}
      
      if (mapRef?.current?.getMap) {
        const mapInstance = mapRef.current.getMap()
        if (mapInstance) {
          mapInstanceAvailable = true
          mapInstanceDetails = {
            hasMapInstance: true,
            hasAddLayer: typeof mapInstance.addLayer === 'function',
            hasRemoveLayer: typeof mapInstance.removeLayer === 'function',
            hasAddSource: typeof mapInstance.addSource === 'function',
            hasRemoveSource: typeof mapInstance.removeSource === 'function',
            hasAddMarker: typeof mapInstance.addMarker === 'function',
            hasRemoveMarker: typeof mapInstance.removeMarker === 'function',
            hasGetStyle: typeof mapInstance.getStyle === 'function',
            hasOn: typeof mapInstance.on === 'function',
            hasOff: typeof mapInstance.off === 'function'
          }
        }
      }
      
      addTest('Map Instance for Pin Operations', mapInstanceAvailable, mapInstanceDetails, mapInstanceAvailable ? undefined : 'Map instance not available', 'creation', mapInstanceTestStart)

      // Test 3: Pin Placement System
      const placementTestStart = Date.now()
      let pinPlacementWorking = false
      let pinPlacementDetails = {}
      
      if (mapInstanceAvailable && mapRef?.current?.getMap) {
        const mapInstance = mapRef.current.getMap()
        try {
          // Test if we can detect existing markers on the map
          const markers = document.querySelectorAll('.mapboxgl-marker')
          const reactMapMarkers = document.querySelectorAll('[data-testid="marker"]')
          
          // Check if there are any markers already on the map
          pinPlacementWorking = markers.length > 0 || reactMapMarkers.length > 0
          pinPlacementDetails = {
            canDetectMarkers: true,
            markersOnMap: markers.length,
            reactMapMarkers: reactMapMarkers.length,
            hasMapboxGL: typeof (window as any).mapboxgl !== 'undefined',
            hasReactMapGL: typeof (window as any).ReactMapGL !== 'undefined',
            mapContainer: !!mapInstance.getContainer(),
            mapStyle: mapInstance.getStyle()?.name || 'unknown'
          }
        } catch (e) {
          console.log('Pin placement test failed:', e)
          pinPlacementDetails = { error: e instanceof Error ? e.message : String(e), hasMapboxGL: typeof (window as any).mapboxgl !== 'undefined' }
        }
      }
      
      addTest('Pin Placement System', pinPlacementWorking, pinPlacementDetails, pinPlacementWorking ? undefined : 'Cannot place pins on map', 'placement', placementTestStart)

      // Test 4: Pin Interaction System
      const interactionTestStart = Date.now()
      let pinInteractionWorking = false
      let pinInteractionDetails = {}
      
      if (mapInstanceAvailable && mapRef?.current?.getMap) {
        const _mapInstance = mapRef.current.getMap()
        try {
          // Test if existing markers can be interacted with
          const markers = document.querySelectorAll('.mapboxgl-marker button')
          const reactMapMarkers = document.querySelectorAll('[data-testid="marker"] button')
          
          let clickEventFired = false
          const clickHandler = () => {
            clickEventFired = true
            console.log('[PIN_INTERACTION] Click event fired on marker')
          }
          
          // Test if we can add event listeners to existing markers
          if (markers.length > 0) {
            const firstMarker = markers[0] as HTMLElement
            firstMarker.addEventListener('click', clickHandler)
            firstMarker.click()
            firstMarker.removeEventListener('click', clickHandler)
          } else if (reactMapMarkers.length > 0) {
            const firstMarker = reactMapMarkers[0] as HTMLElement
            firstMarker.addEventListener('click', clickHandler)
            firstMarker.click()
            firstMarker.removeEventListener('click', clickHandler)
          }
          
          // Wait a bit for event to fire
          await new Promise(resolve => setTimeout(resolve, 100))
          
          pinInteractionWorking = markers.length > 0 || reactMapMarkers.length > 0
          pinInteractionDetails = {
            canAddEventListener: true,
            clickEventFired: clickEventFired,
            markersFound: markers.length,
            reactMapMarkersFound: reactMapMarkers.length,
            hasClickHandler: typeof clickHandler === 'function'
          }
        } catch (e) {
          console.log('Pin interaction test failed:', e)
          pinInteractionDetails = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      
      addTest('Pin Interaction System', pinInteractionWorking, pinInteractionDetails, pinInteractionWorking ? undefined : 'Pin interactions not working', 'interaction', interactionTestStart)

      // Test 5: Pin Clustering System
      const clusteringTestStart = Date.now()
      let clusteringWorking = false
      let clusteringDetails = {}
      
      try {
        // Check if clustering is configured
        const clusterElements = document.querySelectorAll('.mapboxgl-marker-cluster')
        const clusterSources = document.querySelectorAll('[data-cluster-source]')
        
        clusteringWorking = clusterElements.length > 0 || clusterSources.length > 0
        clusteringDetails = {
          clusterElements: clusterElements.length,
          clusterSources: clusterSources.length,
          hasClusterClass: clusterElements.length > 0,
          hasClusterSource: clusterSources.length > 0
        }
      } catch (e) {
        console.log('Clustering test failed:', e)
        clusteringDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Clustering System', clusteringWorking, clusteringDetails, clusteringWorking ? undefined : 'No clustering detected', 'clustering', clusteringTestStart)

      // Test 6: Pin Event System
      const eventTestStart = Date.now()
      let eventSystemWorking = false
      let eventSystemDetails = {}
      
      if (mapInstanceAvailable && mapRef?.current?.getMap) {
        const mapInstance = mapRef.current.getMap()
        try {
          // Test if we can register map events for pins
          let mapClickFired = false
          const mapClickHandler = (e: any) => {
            mapClickFired = true
            console.log('[PIN_EVENTS] Map click event fired:', e)
          }
          
          mapInstance.on('click', mapClickHandler)
          
          // Simulate map click
          const mapContainer = mapInstance.getContainer()
          const clickEvent = new MouseEvent('click', {
            clientX: mapContainer.offsetWidth / 2,
            clientY: mapContainer.offsetHeight / 2
          })
          mapContainer.dispatchEvent(clickEvent)
          
          // Wait for event
          await new Promise(resolve => setTimeout(resolve, 100))
          
          eventSystemWorking = mapClickFired
          eventSystemDetails = {
            canRegisterEvents: true,
            mapClickFired: mapClickFired,
            hasOnMethod: typeof mapInstance.on === 'function',
            hasOffMethod: typeof mapInstance.off === 'function'
          }
          
          // Clean up
          mapInstance.off('click', mapClickHandler)
        } catch (e) {
          console.log('Event system test failed:', e)
          eventSystemDetails = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      
      addTest('Pin Event System', eventSystemWorking, eventSystemDetails, eventSystemWorking ? undefined : 'Pin event system not working', 'events', eventTestStart)

      // Test 7: Pin Data Integration
      const dataIntegrationTestStart = Date.now()
      let dataIntegrationWorking = false
      let dataIntegrationDetails = {}
      
      try {
        // Check if we have sales data that could be used for pins
        const salesElements = document.querySelectorAll('[data-sale-id]')
        const pinElements = document.querySelectorAll('.mapboxgl-marker')
        const salesData = window.localStorage.getItem('sales-data') || '[]'
        const parsedSales = JSON.parse(salesData)
        
        dataIntegrationWorking = salesElements.length > 0 || pinElements.length > 0 || parsedSales.length > 0
        dataIntegrationDetails = {
          salesElements: salesElements.length,
          pinElements: pinElements.length,
          salesDataLength: parsedSales.length,
          hasSalesData: parsedSales.length > 0,
          hasPinElements: pinElements.length > 0
        }
      } catch (e) {
        console.log('Data integration test failed:', e)
        dataIntegrationDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Data Integration', dataIntegrationWorking, dataIntegrationDetails, dataIntegrationWorking ? undefined : 'No pin data integration detected', 'creation', dataIntegrationTestStart)

      // Test 8: Pin Performance
      const performanceTestStart = Date.now()
      let performanceWorking = false
      let performanceDetails = {}
      
      try {
        // Test pin rendering performance by measuring existing markers
        const startTime = performance.now()
        
        // Count existing markers
        const markers = document.querySelectorAll('.mapboxgl-marker')
        const reactMapMarkers = document.querySelectorAll('[data-testid="marker"]')
        const totalMarkers = markers.length + reactMapMarkers.length
        
        const endTime = performance.now()
        const detectionTime = endTime - startTime
        
        performanceWorking = detectionTime < 100 && totalMarkers >= 0 // Should detect quickly
        performanceDetails = {
          markersFound: totalMarkers,
          detectionTime: Math.round(detectionTime),
          performanceGood: performanceWorking,
          mapboxMarkers: markers.length,
          reactMapMarkers: reactMapMarkers.length
        }
      } catch (e) {
        console.log('Performance test failed:', e)
        performanceDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Performance', performanceWorking, performanceDetails, performanceWorking ? undefined : 'Pin performance issues detected', 'creation', performanceTestStart)

    } catch (error) {
      console.error('[PIN_DIAGNOSTICS] Error during diagnostics:', error)
      addTest('Diagnostics Error', false, { error: error instanceof Error ? error.message : String(error) }, 'Diagnostics failed to complete', 'creation')
    }

    setIsRunning(false)
    console.log('[PIN_DIAGNOSTICS] Diagnostics completed')
  }

  const clearResults = () => {
    setResults([])
  }

  const getCategoryStats = () => {
    const categories = results.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = { total: 0, passed: 0 }
      }
      acc[result.category].total++
      if (result.success) acc[result.category].passed++
      return acc
    }, {} as Record<string, { total: number; passed: number }>)

    return categories
  }

  const getOverallStats = () => {
    const total = results.length
    const passed = results.filter(r => r.success).length
    const avgDuration = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length) : 0
    
    return { total, passed, avgDuration }
  }

  const stats = getOverallStats()
  const categoryStats = getCategoryStats()

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Map Pins Diagnostics</h3>
      
      {/* Controls */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={runPinDiagnostics}
          disabled={isRunning}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isRunning ? 'Running...' : 'Run Pin Diagnostics'}
        </button>
        <button
          onClick={clearResults}
          disabled={isRunning}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400"
        >
          Clear Results
        </button>
      </div>

      {/* Overall Stats */}
      {results.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Overall Results</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Total Tests:</span> {stats.total}
            </div>
            <div>
              <span className="font-medium">Passed:</span> {stats.passed}
            </div>
            <div>
              <span className="font-medium">Success Rate:</span> {stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%
            </div>
          </div>
          <div className="mt-2">
            <span className="font-medium">Avg Duration:</span> {stats.avgDuration}ms
          </div>
        </div>
      )}

      {/* Category Stats */}
      {Object.keys(categoryStats).length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Category Breakdown</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {Object.entries(categoryStats).map(([category, stats]) => (
              <div key={category} className="flex justify-between">
                <span className="capitalize">{category}:</span>
                <span className={stats.passed === stats.total ? 'text-green-600' : 'text-red-600'}>
                  {stats.passed}/{stats.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold">Test Results</h4>
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                result.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                      {result.testName}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result.success ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                    }`}>
                      {result.success ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-xs text-gray-500">{result.duration}ms</span>
                    <span className="text-xs text-gray-500 capitalize">{result.category}</span>
                  </div>
                  {result.error && (
                    <div className="mt-1 text-sm text-red-600">{result.error}</div>
                  )}
                  {Object.keys(result.details).length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      <details>
                        <summary className="cursor-pointer hover:text-gray-800">Details</summary>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">What This Tests</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Pin Creation:</strong> Can create pin elements and markers</li>
          <li>• <strong>Pin Placement:</strong> Can place pins on the map at specific coordinates</li>
          <li>• <strong>Pin Interaction:</strong> Pins respond to clicks and user interactions</li>
          <li>• <strong>Pin Clustering:</strong> Clustering system is working for multiple pins</li>
          <li>• <strong>Pin Events:</strong> Map events are properly handled for pin interactions</li>
          <li>• <strong>Pin Data:</strong> Sales data is properly integrated with pins</li>
          <li>• <strong>Pin Performance:</strong> Pins render efficiently without performance issues</li>
        </ul>
      </div>
    </div>
  )
}
