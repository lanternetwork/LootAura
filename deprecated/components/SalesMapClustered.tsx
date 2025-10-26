/** @deprecated Replaced by components/location/SimpleMap.tsx. Not loaded by the app. */
// DEPRECATED: replaced by SimpleMap
'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo, forwardRef } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
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
import { ClusterFeature } from '@/lib/pins/types'
import { createViewportFetchManager, type Viewport, type Filters } from '@/lib/map/viewportFetchManager'

// Convert ClusterResult to ClusterFeature for compatibility with new ClusterMarker
const convertClusterResultToFeature = (cluster: ClusterResult): ClusterFeature => ({
  id: parseInt(cluster.id.replace('cluster-', '')) || 0,
  count: cluster.count || 1,
  lat: cluster.lat,
  lng: cluster.lon,
  expandToZoom: 12 // Default expansion zoom
})
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
import clusterDebug from '@/lib/debug/clusterDebug'

interface SalesMapClusteredProps {
  sales: Sale[]
  markers?: {id: string; title: string; lat: number; lng: number}[]
  center: { lat: number; lng: number }
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
  onClusterClick?: (sales: Sale[]) => void
  onMoveEnd?: () => void
  onZoomEnd?: () => void
  onMapReady?: () => void
  // DOM props that can be safely passed to wrapper
  className?: string
  style?: React.CSSProperties
  id?: string
  'data-testid'?: string
}

const SalesMapClustered = forwardRef<any, SalesMapClusteredProps>(({ 
  sales, 
  markers = [],
  center, 
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
  onClusterClick,
  onMoveEnd,
  onZoomEnd,
  onMapReady,
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
      radius: 0.5, // Only cluster when pins are literally indistinguishable
      maxZoom: 20, // Let algorithm decide when to break clusters
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
    clusterDebug.group('Cluster Update')
    
    if (!isClusteringEnabled() || !clusterIndex) {
      mapDebug.log('Clustering disabled or no cluster index, falling back to individual markers')
      clusterDebug.log('Clustering disabled or no cluster index, falling back to individual markers')
      setClusters([])
      mapDebug.groupEnd()
      clusterDebug.groupEnd()
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

    clusterDebug.logClusterIndex(clusterIndex, 'Getting clusters for viewport')
    const viewportClusters = getClustersForViewport(clusterIndex, bbox, currentZoom)
    setClusters(viewportClusters)

    // Update visible pins for map viewport
    const visibleIds = viewportClusters
      .filter(cluster => cluster.type === 'point')
      .map(cluster => cluster.id)
    
    setVisiblePinIds(visibleIds)
    setVisiblePinCount(visibleIds.length)
    
    clusterDebug.logClusterState(viewportClusters, visibleIds, 'viewport update')
    
    mapDebug.log('Clusters updated', { 
      totalClusters: viewportClusters.length,
      visiblePoints: visibleIds.length,
      clusterTypes: viewportClusters.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    })
    
    mapDebug.logPerformance('Cluster update', startTime)
    clusterDebug.logClusterPerformance('Cluster Update', startTime)
    mapDebug.groupEnd()
    clusterDebug.groupEnd()
    
    if (onVisiblePinsChange) {
      clusterDebug.logVisiblePinsUpdate(visibleIds, visibleIds.length, 'viewport change')
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
    const startTime = Date.now()
    clusterDebug.group('Cluster Click Handler')
    
    console.log('[CLUSTER] Cluster clicked!', { 
      clusterId: cluster.id, 
      hasOnClusterClick: !!onClusterClick,
      hasClusterIndex: !!clusterIndex,
      clusterType: cluster.type 
    })
    console.log('[CLUSTER] handleClusterClick called with cluster:', cluster)
    
    if (!clusterIndex || cluster.type !== 'cluster') {
      clusterDebug.warn('Invalid cluster click - no index or wrong type', { 
        hasIndex: !!clusterIndex, 
        clusterType: cluster.type 
      })
      clusterDebug.groupEnd()
      return
    }

    const map = mapRef.current?.getMap?.()
    if (!map) {
      clusterDebug.error('No map instance available')
      clusterDebug.groupEnd()
      return
    }

    const clusterId = parseInt(cluster.id.replace('cluster-', ''))
    const expansionZoom = getClusterExpansionZoom(clusterIndex, clusterId)
    const targetZoom = Math.min(expansionZoom, 16)
    
    clusterDebug.logClusterClick(cluster, { clusterId, expansionZoom, targetZoom })
    clusterDebug.logClusterExpansion(clusterId, expansionZoom, targetZoom)
    
    // Mark this as a user interaction for the next view change
    // This ensures API calls are triggered when the zoom completes
    map._userInitiatedClusterClick = true
    clusterDebug.log('Set user interaction flag for cluster click')
    
    // Clear the flag after the animation completes
    setTimeout(() => {
      if (map._userInitiatedClusterClick) {
        map._userInitiatedClusterClick = false
        clusterDebug.log('Cleared user interaction flag after animation')
      }
    }, 600) // Slightly longer than the 500ms duration
    
    // Force update visible pins immediately for cluster click
    // This ensures the sales list updates with the new data
    if (onVisiblePinsChange) {
      try {
        // Get the cluster's child points
        const childPoints = clusterIndex.getChildren(clusterId)
        clusterDebug.logClusterChildren(clusterId, childPoints)
        
        const visibleIds = childPoints.map(point => point.id)
        clusterDebug.logVisiblePinsUpdate(visibleIds, visibleIds.length, 'cluster click')
        
        onVisiblePinsChange(visibleIds, visibleIds.length)
        clusterDebug.log('Called onVisiblePinsChange with child points')
      } catch (error) {
        clusterDebug.logClusterError(error as Error, 'getting cluster children')
      }
    } else {
      clusterDebug.warn('onVisiblePinsChange callback not provided')
    }
    
    // Get the cluster's leaves (actual sales) and trigger onClusterClick
    if (onClusterClick) {
      try {
        const leaves = clusterIndex.getLeaves(clusterId)
        console.log('[CLUSTER_CLICK] id=', clusterId, 'leaves=', leaves.length, 'lock=true')
        console.log('[CLUSTER] Available sales:', sales.length, 'sales')
        console.log('[CLUSTER] Leaf IDs:', leaves.map(l => l.properties?.id))
        
        const clusterSales = leaves.map(leaf => {
          // Find the corresponding sale data
          const sale = sales.find(s => s.id === leaf.properties?.id)
          console.log('[CLUSTER] Looking for sale with ID:', leaf.properties?.id, 'Found:', !!sale)
          return sale
        }).filter((sale): sale is Sale => sale !== undefined)
        
        console.log('[CLUSTER] Final cluster sales:', clusterSales.length, 'sales')
        console.log('[CLUSTER] Cluster sales IDs:', clusterSales.map(s => s.id))
        console.log('[CLUSTER] Cluster sales titles:', clusterSales.map(s => s.title))
        
        clusterDebug.log('Triggering onClusterClick with sales data:', clusterSales.length, 'sales')
        onClusterClick(clusterSales)
      } catch (error) {
        clusterDebug.logClusterError(error as Error, 'getting cluster sales data')
      }
    }
    
    clusterDebug.logClusterAnimation(cluster, 500)
    map.easeTo({
      center: [cluster.lon, cluster.lat],
      zoom: targetZoom,
      duration: 500
    })
    
    clusterDebug.logClusterPerformance('Cluster Click', startTime)
    clusterDebug.groupEnd()
  }, [clusterIndex, onVisiblePinsChange, onClusterClick, sales])

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

  // Handle view changes
  const handleViewChange = useCallback((evt: any) => {
    if (!onViewChange) return
    
    // Check if this was triggered by a cluster click
    const map = mapRef.current?.getMap?.()
    const isClusterClick = map?._userInitiatedClusterClick || false
    
    // Safely extract viewState with fallbacks
    const viewState = evt.viewState || evt
    let newCenter = viewState.center || { lat: 0, lng: 0 }
    let newZoom = viewState.zoom || 10
    
    // If this is a cluster click and we don't have proper coordinates, get them from the map
    if (isClusterClick && (newCenter.lat === 0 && newCenter.lng === 0)) {
      try {
        const mapCenter = map.getCenter()
        newCenter = { lat: mapCenter.lat, lng: mapCenter.lng }
        newZoom = map.getZoom()
        console.log('[MAP] Using map center for cluster click:', newCenter, 'zoom:', newZoom)
      } catch (error) {
        console.warn('[MAP] Failed to get map center:', error)
      }
    }
    
    // Don't clear the flag here - it's cleared by timeout in handleClusterClick
    
    // Precise user interaction detection - only detect actual user interactions
    const isUserInteraction = isClusterClick ||
                              evt.isDragging || 
                              evt.isZooming || 
                              evt.originalEvent?.type === 'mousedown' || 
                              evt.originalEvent?.type === 'touchstart' ||
                              evt.originalEvent?.type === 'mouseup' ||
                              evt.originalEvent?.type === 'touchend' ||
                              evt.originalEvent?.type === 'mousemove' ||
                              evt.originalEvent?.type === 'touchmove' ||
                              evt.originalEvent?.type === 'wheel' ||
                              evt.originalEvent?.type === 'pointerdown' ||
                              evt.originalEvent?.type === 'pointerup' ||
                              evt.originalEvent?.type === 'pointermove'
    
    console.log('[MAP] handleViewChange - userInteraction:', isUserInteraction, {
      isDragging: evt.isDragging,
      isZooming: evt.isZooming,
      originalEventType: evt.originalEvent?.type,
      hasSource: !!evt.source,
      hasPointerType: !!evt.originalEvent?.pointerType,
      isClusterClick
    })
    
    onViewChange({
      center: { lat: newCenter.lat, lng: newCenter.lng },
      zoom: newZoom,
      userInteraction: isUserInteraction
    })
  }, [onViewChange])

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
      // Allow fitBounds for all cases
      
      const bounds = [
        [_fitBounds.west, _fitBounds.south],
        [_fitBounds.east, _fitBounds.north]
      ]
      
      console.log('[MAP] fitBounds executing (clustered)', { 
        reason: _fitBounds.reason
      })
      
      map.fitBounds(bounds, { padding: 0, maxZoom: 15, duration: 0 })
      
      if (_onFitBoundsComplete) {
        _onFitBoundsComplete()
      }
    } catch (error) {
      console.error('[MAP] fitBounds error (clustered):', error)
    }
  }, [_fitBounds, _onFitBoundsComplete])

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

    console.log('[CLUSTER] Rendering clusters:', clusters.length, 'clusters')
    console.log('[CLUSTER] Cluster types:', clusters.map(c => ({ id: c.id, type: c.type, count: c.count })))
    
    return clusters.map(cluster => (
      <ClusterMarker
        key={cluster.id}
        cluster={convertClusterResultToFeature(cluster)}
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
        onMove={handleViewChange}
        onClick={(evt: any) => {
          // Check if this is a cluster marker click
          const target = evt.originalEvent?.target
          if (target?.closest('[data-cluster-marker]')) {
            console.log('[MAP] Map onClick event (marker click detected):', evt)
            
            // Get the cluster ID from the clicked element
            const clusterElement = target.closest('[data-cluster-marker]')
            const clusterId = clusterElement?.getAttribute('data-cluster-id')
            
            if (clusterId && clusterIndex) {
              console.log('[MAP] Direct cluster click detected:', clusterId)
              
              // Find the cluster in the clusters array
              const cluster = clusters.find(c => c.id === clusterId)
              if (cluster && cluster.type === 'cluster') {
                console.log('[MAP] Triggering direct cluster click handler:', cluster)
                handleClusterClick(cluster)
              }
            }
          } else {
            console.log('[MAP] Map onClick event (not marker):', evt)
          }
        }}
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
          // Block Mapbox telemetry/events using strict URL parsing (no substring checks)
          try {
            const u = new URL(url)
            const host = u.hostname.toLowerCase()
            const path = u.pathname.toLowerCase()

            const blockedHosts = new Set(['events.mapbox.com'])
            const isBlockedHost = blockedHosts.has(host)
            const isApiEvents = host === 'api.mapbox.com' && (path.startsWith('/events') || path.includes('/events/v2'))
            const isTelemetryOrAnalytics = (host.endsWith('.mapbox.com') || host === 'mapbox.com') && (path.includes('/telemetry') || path.includes('/analytics'))

            if (isBlockedHost || isApiEvents || isTelemetryOrAnalytics) {
              console.log('[MAP] Blocking request:', url)
              return null
            }
            return { url: u.toString() }
          } catch {
            // If URL parsing fails, pass through unchanged
            return { url }
          }
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
