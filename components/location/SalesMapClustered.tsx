'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Sale } from '@/lib/types'
import { getMapboxToken } from '@/lib/maps/token'
import { incMapLoad } from '@/lib/usageLogs'
import { 
  buildClusterIndex, 
  getClustersForViewport, 
  getClusterExpansionZoom,
  getClusterChildren,
  isClusteringEnabled,
  getClusterSizeTier,
  getClusterLabel,
  type ClusterIndex,
  type ClusterResult,
  type ClusterPoint
} from '@/lib/clustering'
import ClusterMarker from './ClusterMarker'

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
}

export default function SalesMapClustered({ 
  sales, 
  markers = [],
  center = { lat: 38.2527, lng: -85.7585 }, 
  zoom = 10,
  onSaleClick,
  selectedSaleId,
  onSearchArea,
  onViewChange,
  centerOverride,
  fitBounds,
  onFitBoundsComplete,
  onBoundsChange,
  onVisiblePinsChange,
  onMoveEnd,
  onZoomEnd,
  onMapReady,
  arbiterMode,
  arbiterAuthority
}: SalesMapClusteredProps) {
  const mapRef = useRef<any>(null)
  const [visiblePinIds, setVisiblePinIds] = useState<string[]>([])
  const [visiblePinCount, setVisiblePinCount] = useState(0)
  const [clusters, setClusters] = useState<ClusterResult[]>([])
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

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

  // Update clusters when viewport changes
  const updateClusters = useCallback((map: any) => {
    if (!isClusteringEnabled() || !clusterIndex) {
      // Fall back to individual markers
      setClusters([])
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
    
    if (onVisiblePinsChange) {
      onVisiblePinsChange(visibleIds, visibleIds.length)
    }
  }, [clusterIndex, onVisiblePinsChange])

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
    onMoveEnd?.()
  }, [updateClusters, onMoveEnd])

  const handleZoomEnd = useCallback(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    updateClusters(map)
    onZoomEnd?.()
  }, [updateClusters, onZoomEnd])

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true)
    onMapReady?.()
    
    const map = mapRef.current?.getMap?.()
    if (map) {
      updateClusters(map)
    }
  }, [updateClusters, onMapReady])

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
        >
          <button
            className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
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

  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
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
    </div>
  )
}
