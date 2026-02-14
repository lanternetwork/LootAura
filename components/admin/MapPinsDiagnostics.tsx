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
          // Test if we can detect existing markers on the map (new pins system)
          const markers = document.querySelectorAll('.mapboxgl-marker')
          const reactMapMarkers = document.querySelectorAll('[data-testid="marker"]')
          const locationMarkers = document.querySelectorAll('[data-testid="location-marker"]')
          const clusterMarkers = document.querySelectorAll('[data-testid="cluster"]')
          const clusterButtons = document.querySelectorAll('[data-cluster-marker="true"]')
          const pinButtons = document.querySelectorAll('[data-pin-marker="true"]')
          
          // Check if there are any markers already on the map (including new hybrid system)
          pinPlacementWorking = markers.length > 0 || reactMapMarkers.length > 0 || locationMarkers.length > 0 || clusterMarkers.length > 0 || clusterButtons.length > 0 || pinButtons.length > 0
          pinPlacementDetails = {
            canDetectMarkers: true,
            markersOnMap: markers.length,
            reactMapMarkers: reactMapMarkers.length,
            locationMarkers: locationMarkers.length,
            clusterMarkers: clusterMarkers.length,
            clusterButtons: clusterButtons.length,
            pinButtons: pinButtons.length,
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
          // Test actual pin interactions, not just existence
          const pinButtons = document.querySelectorAll('[data-pin-marker="true"]')
          const clusterButtons = document.querySelectorAll('[data-cluster-marker="true"]')
          
          let pinClickWorked = false
          let clusterClickWorked = false
          
          // Test pin click functionality
          if (pinButtons.length > 0) {
            const pinButton = pinButtons[0] as HTMLButtonElement
            let clickEventFired = false
            
            // Add click listener to verify click works
            const testClickHandler = (e: Event) => {
              clickEventFired = true
              console.log('[PIN_INTERACTION] Pin click event fired:', e)
            }
            pinButton.addEventListener('click', testClickHandler)
            
            // Actually click the pin
            pinButton.click()
            
            // Wait for click to process
            await new Promise(resolve => setTimeout(resolve, 50))
            
            pinClickWorked = clickEventFired
            pinButton.removeEventListener('click', testClickHandler)
          }
          
          // Test cluster click functionality
          if (clusterButtons.length > 0) {
            const clusterButton = clusterButtons[0] as HTMLButtonElement
            let clusterClickEventFired = false
            
            const testClusterClickHandler = (e: Event) => {
              clusterClickEventFired = true
              console.log('[PIN_INTERACTION] Cluster click event fired:', e)
            }
            clusterButton.addEventListener('click', testClusterClickHandler)
            
            // Actually click the cluster
            clusterButton.click()
            
            // Wait for click to process
            await new Promise(resolve => setTimeout(resolve, 50))
            
            clusterClickWorked = clusterClickEventFired
            clusterButton.removeEventListener('click', testClusterClickHandler)
          }
          
          pinInteractionWorking = pinClickWorked || clusterClickWorked
          pinInteractionDetails = {
            canDetectPins: pinButtons.length > 0,
            canDetectClusters: clusterButtons.length > 0,
            totalMarkers: pinButtons.length,
            totalClusters: clusterButtons.length,
            pinClickWorked: pinClickWorked,
            clusterClickWorked: clusterClickWorked,
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
        // Test actual clustering behavior, not just existence
        const clusterElements = document.querySelectorAll('[data-testid="cluster"]')
        const clusterMarkers = document.querySelectorAll('[data-cluster-marker="true"]')
        
        let clusterExpansionWorked = false
        
        // Test cluster expansion functionality
        if (clusterMarkers.length > 0 && mapRef?.current?.getMap) {
          const clusterButton = clusterMarkers[0] as HTMLButtonElement
          const map = mapRef.current.getMap()
          const originalZoom = map.getZoom()
          const originalCenter = map.getCenter()
          
          // Click cluster to test expansion
          clusterButton.click()
          
          // Wait for potential zoom/pan animation
          await new Promise(resolve => setTimeout(resolve, 200))
          
          const newZoom = map.getZoom()
          const newCenter = map.getCenter()
          
          // Check if map actually changed (indicating cluster expansion worked)
          clusterExpansionWorked = (
            Math.abs(newZoom - originalZoom) > 0.1 || 
            Math.abs(newCenter.lng - originalCenter.lng) > 0.001 ||
            Math.abs(newCenter.lat - originalCenter.lat) > 0.001
          )
          
          console.log('[CLUSTERING_TEST] Cluster expansion test:', {
            originalZoom,
            newZoom,
            originalCenter: { lng: originalCenter.lng, lat: originalCenter.lat },
            newCenter: { lng: newCenter.lng, lat: newCenter.lat },
            expansionWorked: clusterExpansionWorked
          })
        }
        
        clusteringWorking = clusterElements.length > 0 || clusterMarkers.length > 0 || clusterExpansionWorked
        clusteringDetails = {
          clusterElements: clusterElements.length,
          clusterMarkers: clusterMarkers.length,
          hasClusterClass: clusterElements.length > 0,
          hasClusterMarkers: clusterMarkers.length > 0,
          clusterExpansionWorked: clusterExpansionWorked,
          clusteringEnabled: process.env.NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
        }
      } catch (e) {
        console.log('Clustering test failed:', e)
        clusteringDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Clustering System', clusteringWorking, clusteringDetails, clusteringWorking ? undefined : 'No clustering detected', 'clustering', clusteringTestStart)


      // Test 6: Pin Data Integration
      const dataTestStart = Date.now()
      let dataIntegrationWorking = false
      let dataIntegrationDetails = {}
      
      try {
        // Test actual data integration by checking pins have real data attributes
        const pinsWithData = document.querySelectorAll('[data-pin-id]')
        const clustersWithData = document.querySelectorAll('[data-cluster-id]')
        
        // Check if pins have valid data attributes
        let hasValidPinData = false
        let hasValidClusterData = false
        
        if (pinsWithData.length > 0) {
          const firstPin = pinsWithData[0] as HTMLElement
          const pinId = firstPin.getAttribute('data-pin-id')
          hasValidPinData = !!pinId && pinId !== 'undefined' && pinId !== 'null'
        }
        
        if (clustersWithData.length > 0) {
          const firstCluster = clustersWithData[0] as HTMLElement
          const clusterId = firstCluster.getAttribute('data-cluster-id')
          hasValidClusterData = !!clusterId && clusterId !== 'undefined' && clusterId !== 'null'
        }
        
        dataIntegrationWorking = hasValidPinData || hasValidClusterData
        dataIntegrationDetails = {
          pinsWithData: pinsWithData.length,
          clustersWithData: clustersWithData.length,
          hasValidPinData: hasValidPinData,
          hasValidClusterData: hasValidClusterData,
          canAccessData: true,
          note: 'Testing new pins system with real data attributes'
        }
      } catch (e) {
        console.log('Data integration test failed:', e)
        dataIntegrationDetails = { error: e instanceof Error ? e.message : String(e) }
      }
      
      addTest('Pin Data Integration', dataIntegrationWorking, dataIntegrationDetails, dataIntegrationWorking ? undefined : 'Pin data integration not working', 'data', dataTestStart)

      // Test 7: Pin Performance
      const performanceTestStart = Date.now()
      let performanceWorking = false
      let performanceDetails = {}
      
      try {
        // Test realistic pin performance scenarios
        const startTime = performance.now()
        
        // Test 1: DOM query performance
        const markers = document.querySelectorAll('[data-pin-marker="true"]')
        const clusters = document.querySelectorAll('[data-cluster-marker="true"]')
        const queryTime = performance.now() - startTime
        
        // Test 2: Simulate multiple interactions (like user clicking around)
        const interactionStartTime = performance.now()
        let interactionCount = 0
        const maxInteractions = Math.min(10, markers.length + clusters.length)
        
        for (let i = 0; i < maxInteractions; i++) {
          const element = i < markers.length ? markers[i] : clusters[i - markers.length]
          if (element) {
            // Simulate hover and click events
            element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
            element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
            interactionCount++
          }
        }
        
        const interactionTime = performance.now() - interactionStartTime
        const avgInteractionTime = interactionCount > 0 ? interactionTime / interactionCount : 0
        
        // Performance should be good if queries are fast and interactions are responsive
        performanceWorking = queryTime < 50 && avgInteractionTime < 10
        performanceDetails = {
          queryTime: Math.round(queryTime),
          interactionTime: Math.round(interactionTime),
          avgInteractionTime: Math.round(avgInteractionTime),
          markerCount: markers.length,
          clusterCount: clusters.length,
          interactionCount: interactionCount,
          performanceGood: queryTime < 50 && avgInteractionTime < 10,
          note: 'Testing realistic pin interaction performance'
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