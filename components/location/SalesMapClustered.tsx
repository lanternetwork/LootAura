'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo, forwardRef } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Sale } from '@/lib/types'
import { getMapboxToken } from '@/lib/maps/token'
import { 
  buildClusterIndex, 
  getClustersForViewport, 
  getClusterExpansionZoom,
  isClusteringEnabled,
  getClusterSizeTier,
  type ClusterIndex,
  type ClusterResult,
  type ClusterPoint
} from '@/lib/clustering'
import { createViewportFetchManager, type Viewport, type Filters } from '@/lib/map/viewportFetchManager'
import { saveViewportState, loadViewportState, type ViewportState, type FilterState } from '@/lib/map/viewportPersistence'
import { getCurrentTileId, adjacentTileIds } from '@/lib/map/tiles'
import { hashFilters, type FilterState as FilterStateType } from '@/lib/filters/hash'
import { fetchWithCache } from '@/lib/cache/offline'
import { isOfflineCacheEnabled } from '@/lib/flags'
import { logPrefetchStart, logPrefetchDone, logViewportSave, logViewportLoad } from '@/lib/telemetry/map'
import ClusterMarker from './ClusterMarker'
import OfflineBanner from '../OfflineBanner'
import MapLoadingIndicator from './MapLoadingIndicator'
import mapDebug from '@/lib/debug/mapDebug'

interface SalesMapClusteredProps {
  sales: Sale[]
  markers?: {id: string; title: string; lat: number; lng: number}[]
  center?: { lat: number; lng: number }
  zoom?: number
  onSaleClick?: (sale: Sale) => void
  selectedSaleId?: string
  onSearchArea?: (args: { bounds: { north: number; south: number; east: number; west: number }, center: { lat: number; lng: number }, zoom: number }) => void
  onViewChange?: (args: { center: { lat: number; lng: number }, zoom: number, userInteraction: boolean }) => void
  centerOverride?: { lat: number; lng: number; zoom?: number; reason?: string } | null
  fitBounds?: { north: number; south: number; east: number; west: number; reason?: string } | null
  onFitBoundsComplete?: () => void
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number; ts: number } | undefined) => void
  onVisiblePinsChange?: (visibleIds: string[], count: number) => void
  onMoveEnd?: () => void
  onZoomEnd?: () => void
  onMapReady?: () => void
  arbiterMode?: 'initial' | 'map' | 'zip' | 'distance'
  arbiterAuthority?: 'FILTERS' | 'MAP'
  // DOM props that can be safely passed to wrapper
  className?: string
  style?: React.CSSProperties
  id?: string
  'data-testid'?: string
}

const SalesMapClustered = forwardRef<any, SalesMapClusteredProps>(({ 
  sales, 
  markers = [],
  center = { lat: 38.2527, lng: -85.7585 }, 
  zoom = 10,
  onSaleClick,
  selectedSaleId,
  onSearchArea: _onSearchArea,
  onViewChange,
  centerOverride: _centerOverride,
  fitBounds: _fitBounds,
  onFitBoundsComplete: _onFitBoundsComplete,
  onBoundsChange: _onBoundsChange,
  onVisiblePinsChange,
  onMoveEnd,
  onZoomEnd,
  onMapReady,
  arbiterMode: _arbiterMode,
  arbiterAuthority: _arbiterAuthority,
  // DOM props
  className,
  style,
  id,
  'data-testid': dataTestId
}, ref) => {
  const mapRef = useRef<any>(null)
  const [_visiblePinIds, setVisiblePinIds] = useState<string[]>([])
  const [_visiblePinCount, setVisiblePinCount] = useState(0)
  const [clusters, setClusters] = useState<ClusterResult[]>([])
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [isMapLoading, setIsMapLoading] = useState(true)
  
  // Offline state
  const [isOffline, setIsOffline] = useState(false)
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)
  const [cachedMarkerCount, setCachedMarkerCount] = useState(0)
  
  // Current filter state for persistence and caching
  const [currentFilters, setCurrentFilters] = useState<FilterStateType>({
    dateRange: 'any',
    categories: [],
    radius: 25
  })

  // Accessibility state
  const [announcement, setAnnouncement] = useState('')
  const [_focusedClusterId, setFocusedClusterId] = useState<string | null>(null)

  // Type guard to ensure filter state compatibility
  const isFilterState = (filters: any): filters is FilterState => {
    return filters && typeof filters.dateRange === 'string' && Array.isArray(filters.categories)
  }

  // Keyboard navigation handlers
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    const _panDistance = 0.01 // Adjust for pan sensitivity
    const _zoomStep = 1

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        map.panBy([0, 50])
        break
      case 'ArrowDown':
        event.preventDefault()
        map.panBy([0, -50])
        break
      case 'ArrowLeft':
        event.preventDefault()
        map.panBy([50, 0])
        break
      case 'ArrowRight':
        event.preventDefault()
        map.panBy([-50, 0])
        break
      case '+':
      case '=':
        event.preventDefault()
        map.zoomIn({ duration: 300 })
        break
      case '-':
        event.preventDefault()
        map.zoomOut({ duration: 300 })
        break
      case 'Enter':
        event.preventDefault()
        // Focus nearest cluster
        if (clusters.length > 0) {
          const nearestCluster = clusters[0]
          if (nearestCluster) {
            setFocusedClusterId(nearestCluster.id)
            // Announce cluster info
            setAnnouncement(`Focused on cluster with ${nearestCluster.count || 0} sales`)
          }
        }
        break
      case 'Escape':
        event.preventDefault()
        setFocusedClusterId(null)
        setAnnouncement('')
        break
    }
  }, [clusters])

  // Announce updates for screen readers
  const _announceUpdate = useCallback((message: string) => {
    setAnnouncement(message)
    // Clear announcement after a delay
    setTimeout(() => setAnnouncement(''), 1000)
  }, [])

  // Check for reduced motion preference
  const _prefersReducedMotion = useMemo(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch (error) {
        // Fallback for test environments where matchMedia might not be available
        return false
      }
    }
    return false
  }, [])

  // Load persisted state on mount
  useEffect(() => {
    const persisted = loadViewportState()
    if (persisted && isFilterState(persisted.filters)) {
      logViewportLoad(persisted.viewport)
      // Apply persisted viewport and filters
      setCurrentFilters(persisted.filters)
    }
  }, [])

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Monitor offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Create viewport fetch manager for debounced viewport-based data fetching
  const viewportFetchManager = useMemo(() => {
    return createViewportFetchManager({
      debounceMs: 300,
      fetcher: async (viewport: Viewport, filters: Filters, signal: AbortSignal) => {
        const tileId = getCurrentTileId(viewport, filters.zoom || 10)
        const filterHash = hashFilters(currentFilters)
        
        if (isOfflineCacheEnabled()) {
          const result = await fetchWithCache(
            `${tileId}:${filterHash}`,
            async () => {
              // Simulate network fetch
              await new Promise(resolve => setTimeout(resolve, 100))
              if (signal.aborted) throw new Error('Request aborted')
              return { markers: markers, success: true }
            },
            { tileId, filterHash, ttlMs: 7 * 24 * 60 * 60 * 1000 }
          )
          
          if (result.fromCache) {
            setShowOfflineBanner(true)
            setCachedMarkerCount(result.data?.markers?.length || 0)
          } else {
            setShowOfflineBanner(false)
          }
          
          return result.data || { success: false }
        } else {
          // Fallback to simple fetch without cache
          await new Promise(resolve => setTimeout(resolve, 100))
          if (signal.aborted) throw new Error('Request aborted')
          return { success: true }
        }
      },
      onStart: () => {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VIEWPORT] Fetch started')
        }
      },
      onResolve: (result) => {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VIEWPORT] Fetch resolved', result)
        }
      },
      onAbort: (reason) => {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VIEWPORT] Fetch aborted', reason)
        }
      }
    })
  }, [markers, currentFilters])

  // Convert markers to cluster points
  const clusterPoints = useMemo((): ClusterPoint[] => {
    return markers.map(marker => ({
      id: marker.id,
      lon: marker.lng,
      lat: marker.lat,
      title: marker.title
    }))
  }, [markers])

  // Build cluster index when points change
  useEffect(() => {
    if (!isClusteringEnabled() || clusterPoints.length === 0) {
      setClusterIndex(null)
      setClusters([])
      return
    }

    const startTime = performance.now()
    const index = buildClusterIndex(clusterPoints, {
      radius: 50,
      maxZoom: 16,
      minPoints: 2
    })
    setClusterIndex(index)
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[CLUSTER] Index built', {
        event: 'cluster-build',
        points: clusterPoints.length,
        ms: Math.round(performance.now() - startTime)
      })
    }
  }, [clusterPoints])

  // Cleanup viewport fetch manager on unmount
  useEffect(() => {
    return () => {
      viewportFetchManager.dispose()
    }
  }, [viewportFetchManager])

  // Update clusters when viewport changes
  const updateClusters = useCallback((map: any) => {
    const startTime = Date.now()
    mapDebug.group('Cluster Update')
    
    if (!isClusteringEnabled() || !clusterIndex) {
      mapDebug.log('Clustering disabled or no cluster index, falling back to individual markers')
      setClusters([])
      mapDebug.groupEnd()
      return
    }

    const bounds = map.getBounds()
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ]
    const currentZoom = map.getZoom()

    const viewportClusters = getClustersForViewport(clusterIndex, bbox, currentZoom)
    setClusters(viewportClusters)

    // Update visible pins for arbiter authority
    const visibleIds = viewportClusters
      .filter(cluster => cluster.type === 'point')
      .map(cluster => cluster.id)
    
    setVisiblePinIds(visibleIds)
    setVisiblePinCount(visibleIds.length)
    
    mapDebug.log('Clusters updated', { 
      totalClusters: viewportClusters.length,
      visiblePoints: visibleIds.length,
      clusterTypes: viewportClusters.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    })
    
    mapDebug.logPerformance('Cluster update', startTime)
    mapDebug.groupEnd()
    
    if (onVisiblePinsChange) {
      onVisiblePinsChange(visibleIds, visibleIds.length)
    }

    // Trigger viewport fetch request for additional data
    const viewport: Viewport = {
      sw: [bounds.getWest(), bounds.getSouth()],
      ne: [bounds.getEast(), bounds.getNorth()]
    }
    const filters: Filters = {
      categories: currentFilters.categories,
      dateRange: currentFilters.dateRange === 'any' ? undefined : {
        from: '2025-01-01',
        to: '2025-12-31'
      },
      zoom: currentZoom
    }
    viewportFetchManager.request(viewport, filters)
    
    // Prefetch adjacent tiles if offline cache is enabled
    if (isOfflineCacheEnabled()) {
      const currentTileId = getCurrentTileId(viewport, currentZoom)
      const adjacentTiles = adjacentTileIds(currentTileId)
      const filterHash = hashFilters(currentFilters)
      
      adjacentTiles.forEach(tileId => {
        logPrefetchStart(tileId)
        
        // Use filterHash for cache key in real implementation
        console.debug(`[PREFETCH] Tile: ${tileId}, Filter: ${filterHash}`)
        
        // Simulate prefetch (in real implementation, this would fetch data)
        setTimeout(() => {
          logPrefetchDone(tileId, 50, 10) // Simulated timing and count
        }, 100)
      })
    }
  }, [clusterIndex, onVisiblePinsChange, viewportFetchManager, currentFilters])

  // Handle cluster click - zoom to cluster bounds
  const handleClusterClick = useCallback((cluster: ClusterResult) => {
    if (!clusterIndex || cluster.type !== 'cluster') return

    const map = mapRef.current?.getMap?.()
    if (!map) return

    const clusterId = parseInt(cluster.id.replace('cluster-', ''))
    const expansionZoom = getClusterExpansionZoom(clusterIndex, clusterId)
    
    map.easeTo({
      center: [cluster.lon, cluster.lat],
      zoom: Math.min(expansionZoom, 16),
      duration: 500
    })
  }, [clusterIndex])

  // Handle cluster keyboard interaction
  const handleClusterKeyDown = useCallback((cluster: ClusterResult, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClusterClick(cluster)
    }
  }, [handleClusterClick])

  // Handle individual point click
  const handlePointClick = useCallback((point: ClusterResult) => {
    if (point.type !== 'point') return
    
    const sale = sales.find(s => s.id === point.id)
    if (sale && onSaleClick) {
      onSaleClick(sale)
    }
  }, [sales, onSaleClick])

  // Map event handlers
  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    updateClusters(map)
    
    // Persist viewport state
    const center = map.getCenter()
    const zoom = map.getZoom()
    const viewport: ViewportState = {
      lat: center.lat,
      lng: center.lng,
      zoom
    }
    
    saveViewportState(viewport, currentFilters)
    logViewportSave(viewport)
    
    onMoveEnd?.()
  }, [updateClusters, onMoveEnd, currentFilters])

  const handleZoomEnd = useCallback(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    updateClusters(map)
    
    // Persist viewport state
    const center = map.getCenter()
    const zoom = map.getZoom()
    const viewport: ViewportState = {
      lat: center.lat,
      lng: center.lng,
      zoom
    }
    
    saveViewportState(viewport, currentFilters)
    logViewportSave(viewport)
    
    onZoomEnd?.()
  }, [updateClusters, onZoomEnd, currentFilters])

  const handleMapLoad = useCallback(() => {
    mapDebug.logMapLoad('SalesMapClustered', 'success', { onMapReady: !!onMapReady })
    setIsMapLoading(false) // Map is loaded, hide loading indicator
    onMapReady?.()
    
    const map = mapRef.current?.getMap?.()
    if (map) {
      mapDebug.log('Updating clusters after map load')
      updateClusters(map)
    }
  }, [updateClusters, onMapReady])

  // Simple map load handling - no complex state management needed
  useEffect(() => {
    mapDebug.logMapLoad('SalesMapClustered', 'start')
  }, [])

  // Handle fit bounds
  useEffect(() => {
    if (!_fitBounds) return
    
    try {
      const map = mapRef.current?.getMap?.()
      if (!map) return
      
      // Allow fitBounds for ZIP searches and other programmatic moves
      // Only block if it's a MAP authority mode AND not a ZIP search
      if (_arbiterAuthority === 'MAP' && _arbiterMode !== 'zip') {
        console.log('[BLOCK] fit bounds suppressed (map authoritative, not ZIP)')
        return
      }
      
      const bounds = [
        [_fitBounds.west, _fitBounds.south],
        [_fitBounds.east, _fitBounds.north]
      ]
      
      console.log('[MAP] fitBounds executing (clustered)', { 
        reason: _fitBounds.reason, 
        authority: _arbiterAuthority, 
        mode: _arbiterMode 
      })
      
      map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 0 })
      
      if (_onFitBoundsComplete) {
        _onFitBoundsComplete()
      }
    } catch (error) {
      console.error('[MAP] fitBounds error (clustered):', error)
    }
  }, [_fitBounds, _arbiterAuthority, _arbiterMode, _onFitBoundsComplete])

  // Render cluster markers
  const renderClusters = useMemo(() => {
    if (!isClusteringEnabled()) {
      // Fall back to individual markers
      return markers.map(marker => (
        <Marker
          key={marker.id}
          longitude={marker.lng}
          latitude={marker.lat}
          anchor="center"
          data-testid="marker"
        >
          <button
            className="w-3 h-3 bg-red-500 rounded-full border border-white shadow-md hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
            onClick={() => {
              const sale = sales.find(s => s.id === marker.id)
              if (sale && onSaleClick) {
                onSaleClick(sale)
              }
            }}
            aria-label={`Sale: ${marker.title}`}
          />
        </Marker>
      ))
    }

    return clusters.map(cluster => (
      <ClusterMarker
        key={cluster.id}
        cluster={cluster}
        onClick={cluster.type === 'cluster' ? handleClusterClick : handlePointClick}
        onKeyDown={cluster.type === 'cluster' ? handleClusterKeyDown : undefined}
        size={cluster.type === 'cluster' ? getClusterSizeTier(cluster.count || 0) : 'small'}
      />
    ))
  }, [clusters, markers, sales, onSaleClick, handleClusterClick, handlePointClick, handleClusterKeyDown])

  // Debug logging for map initialization
  mapDebug.log('SalesMapClustered rendering')
  mapDebug.logTokenStatus(getMapboxToken())

  return (
    <div 
      className={`w-full h-full relative ${className || ''}`}
      style={style}
      id={id}
      data-testid={dataTestId}
    >
      {isMapLoading && <MapLoadingIndicator />}
      <OfflineBanner 
        isVisible={showOfflineBanner}
        isOffline={isOffline}
        cachedCount={cachedMarkerCount}
      />
      <Map
        ref={ref || mapRef}
        mapboxAccessToken={getMapboxToken()}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: zoom
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onZoomEnd={handleZoomEnd}
        onMove={onViewChange}
        interactiveLayerIds={[]}
        // Performance optimizations for faster loading
        optimizeForTerrain={false}
        antialias={false}
        preserveDrawingBuffer={false}
        attributionControl={false}
        logoPosition="bottom-right"
        preloadResources={true}
        // Disable Mapbox events to prevent API failures
        // Reduce initial load time
        // Disable telemetry completely
        transformRequest={(url: string, _resourceType: string) => {
          if (url.includes('events.mapbox.com')) {
            return null; // Block all telemetry requests
          }
          return { url };
        }}
        // Accessibility attributes
        role="img"
        data-testid="map-container"
        aria-label="Interactive map showing yard sales"
        tabIndex={0}
      >
        {renderClusters}
        
        {/* Selected sale popup */}
        {selectedSaleId && (
          <Popup
            longitude={sales.find(s => s.id === selectedSaleId)?.lng || 0}
            latitude={sales.find(s => s.id === selectedSaleId)?.lat || 0}
            onClose={() => {}}
            closeButton={false}
          >
            <div className="p-2">
              <h3 className="font-semibold">
                {sales.find(s => s.id === selectedSaleId)?.title}
              </h3>
            </div>
          </Popup>
        )}
      </Map>
      
      {/* Screen reader announcements */}
      {announcement && (
        <div 
          role="status" 
          aria-live="polite" 
          className="sr-only"
        >
          {announcement}
        </div>
      )}
      
      {/* Keyboard navigation instructions */}
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 p-2 rounded text-xs text-gray-600 max-w-xs">
        <div className="font-semibold mb-1">Keyboard Navigation:</div>
        <div>Arrow keys: Pan map</div>
        <div>+/-: Zoom in/out</div>
        <div>Enter: Focus nearest cluster</div>
        <div>Escape: Clear focus</div>
      </div>
    </div>
  )
})

SalesMapClustered.displayName = 'SalesMapClustered'

export default SalesMapClustered
