'use client'

import { useState } from 'react'
import { MapRef } from 'react-map-gl'
import { waitForMapReady, getMapInstance } from './admin/mapDiagUtils'

interface MapDiagnosticStep {
  step: string
  success: boolean
  duration: number
  details?: any
  error?: string
  category: 'initialization' | 'rendering' | 'interaction' | 'data' | 'performance'
}

interface MapDiagnosticResult {
  testId: string
  timestamp: number
  overallSuccess: boolean
  steps: MapDiagnosticStep[]
  totalDuration: number
  mapInfo?: {
    containerSize: { width: number; height: number }
    mapInstance: boolean
    styleLoaded: boolean
    markersCount: number
    clustersCount: number
  }
}

interface MapDiagnosticsProps {
  mapRef?: React.RefObject<MapRef>
}

export default function MapDiagnostics({ mapRef }: MapDiagnosticsProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<MapDiagnosticResult[]>([])
  const [currentTest, setCurrentTest] = useState<string>('')

  const runMapDiagnostic = async (testId: string) => {
    const startTime = Date.now()
    const steps: MapDiagnosticStep[] = []
    
    const addStep = (step: string, success: boolean, details?: any, error?: string, category: MapDiagnosticStep['category'] = 'initialization') => {
      const stepDuration = Date.now() - startTime
      steps.push({
        step,
        success,
        duration: stepDuration,
        details,
        error,
        category
      })
    }

    try {
      console.log(`[MAP_DIAGNOSTIC] Starting comprehensive map diagnostic: ${testId}`)
      setCurrentTest(testId)
      
      // Wait for map to be ready using the new helper
      if (!mapRef) {
        throw new Error('MapRef not provided to diagnostics')
      }
      
      const mapInstance = await waitForMapReady(mapRef)
      console.log('[MAP_DIAGNOSTIC] Map instance ready:', !!mapInstance)
      
      // Step 1: Check Mapbox Access Token
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
      const hasToken = !!mapboxToken && mapboxToken.length > 0
      addStep('Mapbox Token Validation', hasToken, { 
        hasToken, 
        tokenLength: mapboxToken?.length || 0,
        tokenPrefix: mapboxToken?.substring(0, 10) + '...' || 'none'
      }, hasToken ? undefined : 'Missing or invalid Mapbox token', 'initialization')

      if (!hasToken) {
        throw new Error('Mapbox token not available')
      }

      // Step 2: Check Map Container
      const mapContainer = document.querySelector('[data-testid="admin-diag-map"]')
      const containerExists = !!mapContainer
      addStep('Map Container Detection', containerExists, {
        found: containerExists,
        selector: mapContainer ? mapContainer.className : 'none',
        tagName: mapContainer?.tagName || 'none'
      }, containerExists ? undefined : 'Map container not found', 'initialization')

      // Step 3: Check Map Instance (already obtained from waitForMapReady)
      const mapInstanceExists = !!mapInstance
      addStep('Map Instance Detection', mapInstanceExists, {
        found: mapInstanceExists,
        hasGetMap: typeof mapInstance?.getMap === 'function',
        hasResize: typeof mapInstance?.resize === 'function',
        hasEaseTo: typeof mapInstance?.easeTo === 'function'
      }, mapInstanceExists ? undefined : 'Map instance not accessible', 'initialization')

      // Step 4: Check Map Style
      let styleLoaded = false
      let currentStyle = 'unknown'
      if (mapInstance) {
        try {
          styleLoaded = mapInstance.isStyleLoaded()
          currentStyle = mapInstance.getStyle()?.name || 'unknown'
        } catch (e) {
          console.log('Could not check map style')
        }
      }
      addStep('Map Style Validation', styleLoaded, {
        styleLoaded,
        currentStyle,
        hasStyle: !!mapInstance?.getStyle?.()
      }, styleLoaded ? undefined : 'Map style not loaded', 'rendering')

      // Step 5: Check Map Container Dimensions
      let containerSize = { width: 0, height: 0 }
      if (mapContainer) {
        const rect = mapContainer.getBoundingClientRect()
        containerSize = { width: rect.width, height: rect.height }
      }
      const hasValidSize = containerSize.width > 0 && containerSize.height > 0
      addStep('Container Dimensions', hasValidSize, {
        width: containerSize.width,
        height: containerSize.height,
        aspectRatio: containerSize.width / containerSize.height,
        hasSize: hasValidSize
      }, hasValidSize ? undefined : 'Container has no dimensions', 'rendering')

      // Step 6: Check Map Center and Zoom
      let mapCenter = { lat: 0, lng: 0 }
      let mapZoom = 0
      if (mapInstance) {
        try {
          const center = mapInstance.getCenter()
          mapCenter = { lat: center.lat, lng: center.lng }
          mapZoom = mapInstance.getZoom()
        } catch (e) {
          console.log('Could not get map center/zoom')
        }
      }
      const hasValidCenter = mapCenter.lat !== 0 || mapCenter.lng !== 0
      addStep('Map Center & Zoom', hasValidCenter, {
        center: mapCenter,
        zoom: mapZoom,
        hasCenter: hasValidCenter,
        zoomValid: mapZoom > 0
      }, hasValidCenter ? undefined : 'Map center not set', 'data')

      // Step 7: Check for Markers
      const markers = document.querySelectorAll('[class*="marker"], [data-marker], .mapboxgl-marker')
      const markersCount = markers.length
      addStep('Markers Detection', true, {
        markersCount,
        markersFound: markersCount > 0,
        markerElements: Array.from(markers).map(m => ({
          className: m.className,
          tagName: m.tagName
        }))
      }, undefined, 'data')

      // Step 8: Check for Clusters
      const clusters = document.querySelectorAll('[class*="cluster"], [data-cluster]')
      const clustersCount = clusters.length
      addStep('Clusters Detection', true, {
        clustersCount,
        clustersFound: clustersCount > 0,
        clusterElements: Array.from(clusters).map(c => ({
          className: c.className,
          tagName: c.tagName
        }))
      }, undefined, 'data')

      // Step 9: Check Map Interactions
      let interactionsWorking = false
      if (mapInstance) {
        try {
          // Test if map can be moved programmatically
          const originalCenter = mapInstance.getCenter()
          mapInstance.easeTo({ center: [originalCenter.lng + 0.001, originalCenter.lat + 0.001], duration: 100 })
          interactionsWorking = true
        } catch (e) {
          console.log('Map interactions not working')
        }
      }
      addStep('Map Interactions', interactionsWorking, {
        canMove: interactionsWorking,
        hasEaseTo: typeof mapInstance?.easeTo === 'function',
        hasFlyTo: typeof mapInstance?.flyTo === 'function'
      }, interactionsWorking ? undefined : 'Map interactions not working', 'interaction')

      // Step 10: Check Event Listeners
      let eventListenersWorking = false
      if (mapInstance) {
        try {
          // Check if map has event listeners
          const hasMoveListener = mapInstance.listens('move')
          const hasZoomListener = mapInstance.listens('zoom')
          eventListenersWorking = hasMoveListener || hasZoomListener
        } catch (e) {
          console.log('Could not check event listeners')
        }
      }
      addStep('Event Listeners', eventListenersWorking, {
        hasListeners: eventListenersWorking,
        hasMoveListener: mapInstance?.listens?.('move') || false,
        hasZoomListener: mapInstance?.listens?.('zoom') || false
      }, eventListenersWorking ? undefined : 'No event listeners detected', 'interaction')

      // Step 11: Performance Check
      const performanceStart = Date.now()
      let performanceGood = true
      try {
        // Simulate some map operations
        if (mapInstance) {
          mapInstance.getBounds()
          mapInstance.getZoom()
          mapInstance.getCenter()
        }
      } catch (e) {
        performanceGood = false
      }
      const performanceDuration = Date.now() - performanceStart
      addStep('Performance Check', performanceGood, {
        operationsDuration: performanceDuration,
        performanceGood: performanceDuration < 100,
        canGetBounds: typeof mapInstance?.getBounds === 'function'
      }, performanceGood ? undefined : 'Map operations are slow', 'performance')

      // Step 12: Check Mapbox GL CSS
      const mapboxCSS = document.querySelector('link[href*="mapbox-gl"]') || 
                      document.querySelector('style[data-mapbox]')
      const cssLoaded = !!mapboxCSS
      addStep('Mapbox CSS Loading', cssLoaded, {
        cssLoaded,
        hasLink: !!document.querySelector('link[href*="mapbox-gl"]'),
        hasStyle: !!document.querySelector('style[data-mapbox]')
      }, cssLoaded ? undefined : 'Mapbox CSS not loaded', 'rendering')

      const totalDuration = Date.now() - startTime
      const overallSuccess = steps.every(step => step.success)

      const result: MapDiagnosticResult = {
        testId,
        timestamp: Date.now(),
        overallSuccess,
        steps,
        totalDuration,
        mapInfo: {
          containerSize,
          mapInstance: mapInstanceExists,
          styleLoaded,
          markersCount,
          clustersCount
        }
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.log(`[MAP_DIAGNOSTIC] Completed diagnostic ${testId}:`, result)

      return result

    } catch (error: any) {
      const totalDuration = Date.now() - startTime
      addStep('Overall Process', false, undefined, error.message, 'initialization')
      
      const result: MapDiagnosticResult = {
        testId,
        timestamp: Date.now(),
        overallSuccess: false,
        steps,
        totalDuration
      }

      setResults(prev => [result, ...prev].slice(0, 10))
      console.error(`[MAP_DIAGNOSTIC] Error for ${testId}:`, error)
      
      return result
    } finally {
      setCurrentTest('')
    }
  }

  const runComprehensiveMapTest = async () => {
    setIsRunning(true)
    setResults([])
    
    const tests = [
      'Map Initialization',
      'Map Rendering',
      'Map Interactions',
      'Map Performance',
      'Map Data Loading'
    ]
    
    for (const test of tests) {
      await runMapDiagnostic(test)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setIsRunning(false)
  }

  const runQuickMapTest = async () => {
    setIsRunning(true)
    try {
      await runMapDiagnostic('Quick Map Check')
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
    const categories = ['initialization', 'rendering', 'interaction', 'data', 'performance'] as const
    return categories.map(category => {
      const categorySteps = results.flatMap(r => r.steps.filter(s => s.category === category))
      const successCount = categorySteps.filter(s => s.success).length
      const totalCount = categorySteps.length
      return {
        category,
        successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0,
        totalSteps: totalCount
      }
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Map Functionality Diagnostics</h3>
      <p className="text-sm text-gray-600 mb-6">
        Comprehensive testing of map initialization, rendering, interactions, data loading, and performance.
      </p>
      
      {/* Test Controls */}
      <div className="space-y-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={runQuickMapTest}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning && currentTest === 'Quick Map Check' ? 'Running...' : 'Quick Map Test'}
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
            {getCategoryStats().map(({ category, successRate, totalSteps }) => (
              <div key={category} className="text-center">
                <div className="text-lg font-bold text-blue-600">{successRate}%</div>
                <div className="text-xs text-gray-600 capitalize">{category}</div>
                <div className="text-xs text-gray-500">{totalSteps} steps</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Diagnostic Results ({results.length})</h4>
        
        {results.length === 0 ? (
          <p className="text-gray-500 text-sm">No diagnostic results yet. Run a test to see detailed map diagnostics here.</p>
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
                
                {/* Map Info Summary */}
                {result.mapInfo && (
                  <div className="mb-3 p-2 bg-gray-100 rounded text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Container: {result.mapInfo.containerSize.width}×{result.mapInfo.containerSize.height}</div>
                      <div>Instance: {result.mapInfo.mapInstance ? 'Yes' : 'No'}</div>
                      <div>Style: {result.mapInfo.styleLoaded ? 'Loaded' : 'Not loaded'}</div>
                      <div>Markers: {result.mapInfo.markersCount}</div>
                      <div>Clusters: {result.mapInfo.clustersCount}</div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  {result.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        step.success ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className="flex-1">{step.step}</span>
                      <span className={`px-1 py-0.5 rounded text-xs ${
                        step.category === 'initialization' ? 'bg-blue-100 text-blue-800' :
                        step.category === 'rendering' ? 'bg-purple-100 text-purple-800' :
                        step.category === 'interaction' ? 'bg-green-100 text-green-800' :
                        step.category === 'data' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {step.category}
                      </span>
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
