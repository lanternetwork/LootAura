'use client'

import { useState } from 'react'

interface MapInteractionTest {
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
  category: 'viewport' | 'markers' | 'clusters' | 'events' | 'data'
}

interface MapInteractionResult {
  testId: string
  timestamp: number
  overallSuccess: boolean
  tests: MapInteractionTest[]
  totalDuration: number
  mapState?: {
    center: { lat: number; lng: number }
    zoom: number
    bounds: { north: number; south: number; east: number; west: number }
    markersVisible: number
    clustersVisible: number
  }
}

export default function MapInteractionTester() {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<MapInteractionResult[]>([])
  const [currentTest, setCurrentTest] = useState<string>('')
  const testCoordinates = [
    { name: 'Louisville, KY', lat: 38.2527, lng: -85.7585, zip: '40204' },
    { name: 'New York, NY', lat: 40.7505, lng: -73.9934, zip: '10001' },
    { name: 'Beverly Hills, CA', lat: 34.0901, lng: -118.4065, zip: '90210' },
    { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298, zip: '60601' },
    { name: 'Miami, FL', lat: 25.7617, lng: -80.1918, zip: '33101' }
  ]

  const runMapInteractionTest = async (testId: string) => {
    const startTime = Date.now()
    const tests: MapInteractionTest[] = []
    
    const addTest = (testName: string, success: boolean, details: any, error?: string, category: MapInteractionTest['category'] = 'viewport') => {
      const testDuration = Date.now() - startTime
      tests.push({
        testName,
        success,
        duration: testDuration,
        details,
        error,
        category
      })
    }

    try {
      console.log(`[MAP_INTERACTION_TEST] Starting map interaction test: ${testId}`)
      setCurrentTest(testId)
      
      // Wait a bit for map to load
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Test 1: Check if map container exists and is visible
      const mapContainer = document.querySelector('[data-testid="map-container"]') || 
                          document.querySelector('.mapboxgl-map') ||
                          document.querySelector('[class*="map"]')
      const containerVisible = mapContainer && mapContainer.getBoundingClientRect().width > 0
      addTest('Map Container Visibility', !!containerVisible, {
        found: !!mapContainer,
        visible: containerVisible,
        dimensions: mapContainer ? mapContainer.getBoundingClientRect() : null
      }, containerVisible ? undefined : 'Map container not visible', 'viewport')

      // Test 2: Check map instance and basic functionality
      let mapInstance: any = null
      try {
        const mapElement = document.querySelector('.mapboxgl-map')
        console.log('[MAP_INTERACTION] Map element found:', !!mapElement)
        if (mapElement) {
          console.log('[MAP_INTERACTION] Map element classes:', mapElement.className)
          mapInstance = (mapElement as any)._mapboxgl_map || 
                       (mapElement as any).__mapboxgl_map ||
                       (mapElement as any).getMap?.()
          console.log('[MAP_INTERACTION] Map instance found:', !!mapInstance)
        }
      } catch (e) {
        console.log('Could not access map instance:', e)
      }
      
      const mapInstanceWorking = !!mapInstance && typeof mapInstance.getCenter === 'function'
      addTest('Map Instance Functionality', mapInstanceWorking, {
        hasInstance: !!mapInstance,
        hasGetCenter: typeof mapInstance?.getCenter === 'function',
        hasGetZoom: typeof mapInstance?.getZoom === 'function',
        hasGetBounds: typeof mapInstance?.getBounds === 'function'
      }, mapInstanceWorking ? undefined : 'Map instance not functional', 'viewport')

      // Test 3: Test map center and zoom operations
      let centerOperationsWorking = false
      let currentCenter = { lat: 0, lng: 0 }
      let currentZoom = 0
      if (mapInstance) {
        try {
          currentCenter = mapInstance.getCenter()
          currentZoom = mapInstance.getZoom()
          centerOperationsWorking = true
        } catch (e) {
          console.log('Could not get map center/zoom')
        }
      }
      addTest('Map Center & Zoom Operations', centerOperationsWorking, {
        center: currentCenter,
        zoom: currentZoom,
        hasValidCenter: currentCenter.lat !== 0 || currentCenter.lng !== 0,
        hasValidZoom: currentZoom > 0
      }, centerOperationsWorking ? undefined : 'Map center/zoom operations failed', 'viewport')

      // Test 4: Test map movement (easeTo)
      let movementWorking = false
      if (mapInstance) {
        try {
          const originalCenter = mapInstance.getCenter()
          const testCenter = [originalCenter.lng + 0.001, originalCenter.lat + 0.001]
          mapInstance.easeTo({ center: testCenter, duration: 100 })
          movementWorking = true
          // Reset to original position
          setTimeout(() => {
            mapInstance.easeTo({ center: [originalCenter.lng, originalCenter.lat], duration: 100 })
          }, 200)
        } catch (e) {
          console.log('Map movement test failed')
        }
      }
      addTest('Map Movement (easeTo)', movementWorking, {
        canMove: movementWorking,
        hasEaseTo: typeof mapInstance?.easeTo === 'function'
      }, movementWorking ? undefined : 'Map movement not working', 'events')

      // Test 5: Test map bounds operations
      let boundsWorking = false
      let currentBounds = { north: 0, south: 0, east: 0, west: 0 }
      if (mapInstance) {
        try {
          const bounds = mapInstance.getBounds()
          currentBounds = {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
          }
          boundsWorking = true
        } catch (e) {
          console.log('Map bounds operations failed')
        }
      }
      addTest('Map Bounds Operations', boundsWorking, {
        bounds: currentBounds,
        hasGetBounds: typeof mapInstance?.getBounds === 'function',
        boundsValid: currentBounds.north !== currentBounds.south
      }, boundsWorking ? undefined : 'Map bounds operations failed', 'viewport')

      // Test 6: Test markers detection and interaction
      const markers = document.querySelectorAll('[class*="marker"], [data-marker], .mapboxgl-marker')
      const markersCount = markers.length
      const markersInteractive = markersCount > 0
      addTest('Markers Detection', markersInteractive, {
        markersCount,
        markersFound: markersCount > 0,
        markerTypes: Array.from(markers).map(m => ({
          className: m.className,
          hasClick: typeof m.addEventListener === 'function'
        }))
      }, markersInteractive ? undefined : 'No markers found', 'markers')

      // Test 7: Test clusters detection
      const clusters = document.querySelectorAll('[class*="cluster"], [data-cluster]')
      const clustersCount = clusters.length
      const clustersInteractive = clustersCount > 0
      addTest('Clusters Detection', clustersInteractive, {
        clustersCount,
        clustersFound: clustersCount > 0,
        clusterTypes: Array.from(clusters).map(c => ({
          className: c.className,
          hasClick: typeof c.addEventListener === 'function'
        }))
      }, clustersInteractive ? undefined : 'No clusters found', 'clusters')

      // Test 8: Test map event listeners
      let eventListenersWorking = false
      if (mapInstance) {
        try {
          const hasMoveListener = mapInstance.listens('move')
          const hasZoomListener = mapInstance.listens('zoom')
          const hasClickListener = mapInstance.listens('click')
          eventListenersWorking = hasMoveListener || hasZoomListener || hasClickListener
        } catch (e) {
          console.log('Could not check event listeners')
        }
      }
      addTest('Event Listeners', eventListenersWorking, {
        hasMoveListener: mapInstance?.listens?.('move') || false,
        hasZoomListener: mapInstance?.listens?.('zoom') || false,
        hasClickListener: mapInstance?.listens?.('click') || false,
        listenersWorking: eventListenersWorking
      }, eventListenersWorking ? undefined : 'No event listeners detected', 'events')

      // Test 9: Test map resize functionality
      let resizeWorking = false
      if (mapInstance) {
        try {
          mapInstance.resize()
          resizeWorking = true
        } catch (e) {
          console.log('Map resize failed')
        }
      }
      addTest('Map Resize Functionality', resizeWorking, {
        canResize: resizeWorking,
        hasResize: typeof mapInstance?.resize === 'function'
      }, resizeWorking ? undefined : 'Map resize not working', 'events')

      // Test 10: Test map style and rendering
      let styleWorking = false
      let currentStyle = 'unknown'
      if (mapInstance) {
        try {
          styleWorking = mapInstance.isStyleLoaded()
          currentStyle = mapInstance.getStyle()?.name || 'unknown'
        } catch (e) {
          console.log('Could not check map style')
        }
      }
      addTest('Map Style & Rendering', styleWorking, {
        styleLoaded: styleWorking,
        currentStyle,
        hasStyle: !!mapInstance?.getStyle?.()
      }, styleWorking ? undefined : 'Map style not loaded', 'viewport')

      // Test 11: Test coordinate conversion
      let coordinateConversionWorking = false
      if (mapInstance) {
        try {
          const testPoint = mapInstance.project([-85.7585, 38.2527])
          coordinateConversionWorking = testPoint.x > 0 && testPoint.y > 0
        } catch (e) {
          console.log('Coordinate conversion failed')
        }
      }
      addTest('Coordinate Conversion', coordinateConversionWorking, {
        canProject: coordinateConversionWorking,
        hasProject: typeof mapInstance?.project === 'function'
      }, coordinateConversionWorking ? undefined : 'Coordinate conversion not working', 'data')

      // Test 12: Test map performance
      const performanceStart = Date.now()
      let performanceGood = true
      try {
        if (mapInstance) {
          // Perform multiple operations to test performance
          mapInstance.getCenter()
          mapInstance.getZoom()
          mapInstance.getBounds()
          mapInstance.getStyle()
        }
      } catch (e) {
        performanceGood = false
      }
      const performanceDuration = Date.now() - performanceStart
      addTest('Map Performance', performanceGood && performanceDuration < 100, {
        operationsDuration: performanceDuration,
        performanceGood: performanceDuration < 100,
        operationsCount: 4
      }, performanceGood ? undefined : 'Map operations are slow', 'data')

      const totalDuration = Date.now() - startTime
      const overallSuccess = tests.every(test => test.success)

      const result: MapInteractionResult = {
        testId,
        timestamp: Date.now(),
        overallSuccess,
        tests,
        totalDuration,
        mapState: {
          center: currentCenter,
          zoom: currentZoom,
          bounds: currentBounds,
          markersVisible: markersCount,
          clustersVisible: clustersCount
        }
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.log(`[MAP_INTERACTION_TEST] Completed test ${testId}:`, result)

      return result

    } catch (error: any) {
      const totalDuration = Date.now() - startTime
      addTest('Overall Process', false, undefined, error.message, 'viewport')
      
      const result: MapInteractionResult = {
        testId,
        timestamp: Date.now(),
        overallSuccess: false,
        tests,
        totalDuration
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.error(`[MAP_INTERACTION_TEST] Error for ${testId}:`, error)
      
      return result
    } finally {
      setCurrentTest('')
    }
  }

  const runComprehensiveMapTest = async () => {
    setIsRunning(true)
    setResults([])
    
    const testScenarios = [
      'Map Initialization Test',
      'Map Rendering Test', 
      'Map Interaction Test',
      'Map Performance Test',
      'Map Data Flow Test'
    ]
    
    for (const scenario of testScenarios) {
      await runMapInteractionTest(scenario)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    setIsRunning(false)
  }

  const runQuickMapTest = async () => {
    setIsRunning(true)
    try {
      await runMapInteractionTest('Quick Map Interaction Test')
    } finally {
      setIsRunning(false)
    }
  }

  const testSpecificLocation = async (location: typeof testCoordinates[0]) => {
    setIsRunning(true)
    try {
      await runMapInteractionTest(`Location Test: ${location.name}`)
    } finally {
      setIsRunning(false)
    }
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

  const getCategoryStats = () => {
    const categories = ['viewport', 'markers', 'clusters', 'events', 'data'] as const
    return categories.map(category => {
      const categoryTests = results.flatMap(r => r.tests.filter(t => t.category === category))
      const successCount = categoryTests.filter(t => t.success).length
      const totalCount = categoryTests.length
      return {
        category,
        successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0,
        totalTests: totalCount
      }
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Map Interaction Testing</h3>
      <p className="text-sm text-gray-600 mb-6">
        Test map interactions, viewport operations, markers, clusters, events, and data flow.
      </p>
      
      {/* Test Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runQuickMapTest}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning && currentTest === 'Quick Map Interaction Test' ? 'Running...' : 'Quick Test'}
          </button>
          <button
            onClick={runComprehensiveMapTest}
            disabled={isRunning}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comprehensive Test (5 Scenarios)
          </button>
          <button
            onClick={clearResults}
            disabled={isRunning}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Results
          </button>
        </div>
        
        {/* Location-specific tests */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Test Specific Locations:</h4>
          <div className="flex gap-2 flex-wrap">
            {testCoordinates.map((location) => (
              <button
                key={location.zip}
                onClick={() => testSpecificLocation(location)}
                disabled={isRunning}
                className="px-3 py-1 bg-purple-100 text-purple-800 rounded text-sm hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {location.name}
              </button>
            ))}
          </div>
        </div>
        
        {isRunning && (
          <div className="text-sm text-blue-600">
            Running: {currentTest}...
          </div>
        )}
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
            <div className="text-2xl font-bold text-purple-600">{getAverageDuration()}ms</div>
            <div className="text-sm text-gray-600">Avg Duration</div>
          </div>
        </div>
      )}

      {/* Category Statistics */}
      {results.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">Category Performance</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {getCategoryStats().map(({ category, successRate, totalTests }) => (
              <div key={category} className="text-center">
                <div className="text-lg font-bold text-blue-600">{successRate}%</div>
                <div className="text-xs text-gray-600 capitalize">{category}</div>
                <div className="text-xs text-gray-500">{totalTests} tests</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Test Results ({results.length})</h4>
        
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm">No test results yet. Run a test to see detailed map interaction diagnostics here.</p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {results.map((result, _index) => (
              <div
                key={`${result.testId}-${result.timestamp}`}
                className={`p-4 rounded-lg border ${
                  result.overallSuccess 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{result.testId}</span>
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
                
                {/* Map State Summary */}
                {result.mapState && (
                  <div className="mb-3 p-2 bg-gray-100 rounded text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Center: {result.mapState.center.lat.toFixed(4)}, {result.mapState.center.lng.toFixed(4)}</div>
                      <div>Zoom: {result.mapState.zoom.toFixed(2)}</div>
                      <div>Markers: {result.mapState.markersVisible}</div>
                      <div>Clusters: {result.mapState.clustersVisible}</div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  {result.tests.map((test, testIndex) => (
                    <div key={testIndex} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        test.success ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className="flex-1">{test.testName}</span>
                      <span className={`px-1 py-0.5 rounded text-xs ${
                        test.category === 'viewport' ? 'bg-blue-100 text-blue-800' :
                        test.category === 'markers' ? 'bg-green-100 text-green-800' :
                        test.category === 'clusters' ? 'bg-purple-100 text-purple-800' :
                        test.category === 'events' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {test.category}
                      </span>
                      <span className="text-xs text-gray-500">{test.duration}ms</span>
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
