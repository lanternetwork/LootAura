'use client'

import { useEffect, useRef } from 'react'

interface CustomPinProps {
  id: string
  lat: number
  lng: number
  isSelected?: boolean
  onClick?: (id: string) => void
}

export default function CustomPin({ 
  id, 
  lat, 
  lng, 
  isSelected = false,
  onClick 
}: CustomPinProps) {
  const pinRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinRef.current) return

    const mapElement = pinRef.current.closest('.mapboxgl-map') as HTMLElement & { __mapboxgl_map?: any }
    const map = mapElement?.__mapboxgl_map
    if (!map) return

    // Create a custom DOM element
    const el = document.createElement('div')
    el.id = `pin-${id}`
    el.style.cssText = `
      width: 8px;
      height: 8px;
      background-color: ${isSelected ? '#dc2626' : '#ef4444'};
      border-radius: 50%;
      cursor: pointer;
      border: ${isSelected ? '2px solid white' : '1px solid white'};
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      outline: none !important;
      position: absolute;
      transform: translate(-50%, -50%);
      z-index: 1;
    `
    
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick?.(id)
    })

    // Add to map
    const container = map.getContainer()
    container.appendChild(el)

    // Position the pin
    const project = map.project([lng, lat])
    el.style.left = `${project.x}px`
    el.style.top = `${project.y}px`

    // Update position on map move
    const updatePosition = () => {
      const project = map.project([lng, lat])
      el.style.left = `${project.x}px`
      el.style.top = `${project.y}px`
    }

    map.on('move', updatePosition)
    map.on('zoom', updatePosition)

    return () => {
      map.off('move', updatePosition)
      map.off('zoom', updatePosition)
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    }
  }, [id, lat, lng, isSelected, onClick])

  return <div ref={pinRef} style={{ display: 'none' }} />
}

