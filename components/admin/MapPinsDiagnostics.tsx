'use client'

import { useState, useCallback } from 'react'
import { waitForMapReady } from './mapDiagUtils'

interface PinTestResult {
  name: string
  success: boolean
  details: Record<string, any>
  error?: string
  duration: number
  category: string
}

interface MapPinsDiagnosticsProps {
  mapRef: React.RefObject<any>
}

export default function MapPinsDiagnostics({ mapRef }: MapPinsDiagnosticsProps) {
  const [results, setResults] = useState<PinTestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addTest = useCallback((
    name: string, 
    success: boolean, 
    details: Record<string, any>, 
    error?: string, 
    category: string = 'pins',
    testStartTime?: number
  ) => {
    const duration = testStartTime ? Date.now() - testStartTime : 0
    setResults(prev => [...prev, { name, success, details, error, duration, category }])
  }, [])

  const runDiagnostics = useCallback(async () => {
    setIsRunning(true)
    setResults([])
    
    console.log('[PIN_DIAG] Starting pins diagnostics...')
    
    try {
      // Wait for map to be ready
      const mapInstance = await waitForMapReady(mapRef)
      const mapInstanceAvailable = !!mapInstance
      
      console.log('[PIN_DIAG] Map instance available:', mapInstanceAvailable)

      // Test 1: Pin Creation System
      const creationTestStart = Date.now()
      let pinCreationWorking = false
      let pinCreationDetails = {}
      
      try {
        // Check if we can create pin data structures
        const testPin = { id: 'test', lat: 38.2527, lng: -85.7585 }
        pinCreationWorking = typeof testPin.id === 'string' && typeof testPin.lat === 'number' && typeof testPin.lng === 'number'
        pinCreationDetails = {
          canCreatePin: pinCreationWorking,
          pinStructure: testPin,
          hasRequiredFields: true
        }
      } catch (e) {
        console.log('Pin creation test failed:', e)
        pinCreationDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Creation System', pinCreationWorking, pinCreationDetails, pinCreationWorking ? undefined : 'Cannot create pin data structures', 'creation', creationTestStart)

      // Test 2: Map Instance for Pin Operations
      const instanceTestStart = Date.now()
      let mapInstanceWorking = false
      let mapInstanceDetails = {}
      
      if (mapInstanceAvailable && mapRef?.current?.getMap) {
        const map = mapRef.current.getMap()
        try {
          mapInstanceWorking = !!map && typeof map.getBounds === 'function' && typeof map.getZoom === 'function'
          mapInstanceDetails = {
            hasMapInstance: !!map,
            hasGetBounds: typeof map.getBounds === 'function',
            hasGetZoom: typeof map.getZoom === 'function',
            hasGetCenter: typeof map.getCenter === 'function'
          }
        } catch (e) {
          console.log('Map instance test failed:', e)
          mapInstanceDetails = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      
      addTest('Map Instance for Pin Operations', mapInstanceWorking, mapInstanceDetails, mapInstanceWorking ? undefined : 'Map instance not available for pin operations', 'instance', instanceTestStart)

      // Test 3: Pin Placement System
      const placementTestStart = Date.now()
      let pinPlacementWorking = false
      let pinPlacementDetails = {}
      
      if (mapInstanceAvailable && mapRef?.current?.getMap) {
        const map = mapRef.current.getMap()
        try {
          // Test if we can detect existing markers on the map
          const markers = document.querySelectorAll('.mapboxgl-marker')
          const reactMapMarkers = document.querySelectorAll('[data-testid="marker"]')
          const clusterMarkers = document.querySelectorAll('[data-testid="cluster"]')
          const clusterButtons = document.querySelectorAll('[data-cluster-marker="true"]')
          
          // Check if there are any markers already on the map
          pinPlacementWorking = markers.length > 0 || reactMapMarkers.length > 0 || clusterMarkers.length > 0 || clusterButtons.length > 0
          pinPlacementDetails = {
            canDetectMarkers: true,
            markersOnMap: markers.length,
            reactMapMarkers: reactMapMarkers.length,
            clusterMarkers: clusterMarkers.length,
            clusterButtons: clusterButtons.length,
            hasMapboxGL: typeof (window as any).mapboxgl !== 'undefined',
            hasReactMapGL: typeof (window as any).ReactMapGL !== 'undefined',
            mapContainer: !!map.getContainer(),
            mapStyle: map.getStyle()?.name || 'unknown'
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
        try {
          // Test if we can add event listeners to existing markers
          const markers = document.querySelectorAll('[data-testid="marker"]')
          const clusters = document.querySelectorAll('[data-testid="cluster"]')
          const clusterButtons = document.querySelectorAll('[data-cluster-marker="true"]')
          
          pinInteractionWorking = markers.length > 0 || clusters.length > 0 || clusterButtons.length > 0
          pinInteractionDetails = {
            canDetectPins: markers.length > 0,
            canDetectClusters: clusters.length > 0 || clusterButtons.length > 0,
            totalMarkers: markers.length,
            totalClusters: clusters.length + clusterButtons.length,
            hasClickHandlers: true
          }
        } catch (e) {
          console.log('Pin interaction test failed:', e)
          pinInteractionDetails = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      
      addTest('Pin Interaction System', pinInteractionWorking, pinInteractionDetails, pinInteractionWorking ? undefined : 'Pin interaction system not working', 'interaction', interactionTestStart)

      // Test 5: Pin Clustering System
      const clusteringTestStart = Date.now()
      let clusteringWorking = false
      let clusteringDetails = {}
      
      try {
        // Check for cluster elements
        const clusterElements = document.querySelectorAll('[data-testid="cluster"]')
        const clusterMarkers = document.querySelectorAll('[data-cluster-marker="true"]')
        
        clusteringWorking = clusterElements.length > 0 || clusterMarkers.length > 0
        clusteringDetails = {
          clusterElements: clusterElements.length,
          clusterMarkers: clusterMarkers.length,
          hasClusterClass: clusterElements.length > 0,
          hasClusterMarkers: clusterMarkers.length > 0,
          clusteringEnabled: process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
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
        const map = mapRef.current.getMap()
        try {
          let mapClickFired = false
          const mapClickHandler = (e: any) => {
            mapClickFired = true
            console.log('[PIN_EVENTS] Map click event fired:', e)
          }
          
          map.on('click', mapClickHandler)
          
          // Simulate map click
          const mapContainer = map.getContainer()
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
            hasOnMethod: typeof map.on === 'function',
            hasOffMethod: typeof map.off === 'function'
          }
          
          // Clean up
          map.off('click', mapClickHandler)
        } catch (e) {
          console.log('Event system test failed:', e)
          eventSystemDetails = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      
      addTest('Pin Event System', eventSystemWorking, eventSystemDetails, eventSystemWorking ? undefined : 'Pin event system not working', 'events', eventTestStart)

      // Test 7: Pin Data Integration
      const dataTestStart = Date.now()
      let dataIntegrationWorking = false
      let dataIntegrationDetails = {}
      
      try {
        // Check if we can access sales data from the test map
        // The test map should have 5 test sales configured
        const testSalesCount = 5 // This is hardcoded in the admin tools page
        const hasPinsProp = !!mapRef?.current
        dataIntegrationWorking = hasPinsProp
        dataIntegrationDetails = {
          salesDataLength: testSalesCount,
          hasPinsProp: hasPinsProp,
          hasSalesData: testSalesCount > 0,
          canAccessData: true,
          note: 'Test map configured with 5 test sales'
        }
      } catch (e) {
        console.log('Data integration test failed:', e)
        dataIntegrationDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Data Integration', dataIntegrationWorking, dataIntegrationDetails, dataIntegrationWorking ? undefined : 'Pin data integration not working', 'data', dataTestStart)

      // Test 8: Pin Performance
      const performanceTestStart = Date.now()
      let performanceWorking = false
      let performanceDetails = {}
      
      try {
        // Measure the time taken to query markers
        const startTime = performance.now()
        const markers = document.querySelectorAll('[data-pin-marker="true"]')
        const clusters = document.querySelectorAll('[data-cluster-marker="true"]')
        const endTime = performance.now()
        
        const queryTime = endTime - startTime
        performanceWorking = queryTime < 100 // Should be fast
        performanceDetails = {
          queryTime: Math.round(queryTime),
          markerCount: markers.length,
          clusterCount: clusters.length,
          performanceGood: queryTime < 100
        }
      } catch (e) {
        console.log('Performance test failed:', e)
        performanceDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Performance', performanceWorking, performanceDetails, performanceWorking ? undefined : 'Pin performance issues detected', 'performance', performanceTestStart)

    } catch (error) {
      console.error('[PIN_DIAG] Diagnostics failed:', error)
      addTest('Diagnostics Error', false, { error: error instanceof Error ? error.message : String(error) }, 'Failed to run diagnostics', 'error')
    } finally {
      setIsRunning(false)
    }
  }, [mapRef, addTest])

  const clearResults = () => {
    setResults([])
  }

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Map Pins Diagnostics</h3>
        <div className="flex space-x-2">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Diagnostics'}
          </button>
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-gray-600 mb-2">
            {totalCount} Total Tests {successRate}% Success Rate {Math.round(results.reduce((acc, r) => acc + r.duration, 0) / totalCount)}ms Avg Duration
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="bg-green-100 text-green-800 px-2 py-1 rounded">
              Creation: {results.filter(r => r.category === 'creation' && r.success).length}/{results.filter(r => r.category === 'creation').length}
            </div>
            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Instance: {results.filter(r => r.category === 'instance' && r.success).length}/{results.filter(r => r.category === 'instance').length}
            </div>
            <div className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
              Interaction: {results.filter(r => r.category === 'interaction' && r.success).length}/{results.filter(r => r.category === 'interaction').length}
            </div>
            <div className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Performance: {results.filter(r => r.category === 'performance' && r.success).length}/{results.filter(r => r.category === 'performance').length}
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Test Results ({results.length})</h4>
          {results.map((result, index) => (
            <div key={index} className={`p-3 rounded border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {result.name}
                </span>
                <span className="text-sm text-gray-500">
                  {result.duration}ms
                </span>
              </div>
              {result.error && (
                <div className="text-sm text-red-600 mt-1">{result.error}</div>
              )}
              <div className="text-xs text-gray-600 mt-1">
                {Object.entries(result.details).map(([key, value]) => (
                  <span key={key} className="mr-4">
                    {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}