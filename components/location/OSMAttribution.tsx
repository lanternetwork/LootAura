'use client'

interface OSMAttributionProps {
  className?: string
  showGeocoding?: boolean
}

export default function OSMAttribution({ className = '', showGeocoding = true }: OSMAttributionProps) {
  return (
    <div className={`text-xs text-gray-500 ${className}`} role="contentinfo">
      <span>
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700"
          aria-label="OpenStreetMap copyright information"
        >
          OpenStreetMap
        </a>{' '}
        contributors
      </span>
      {showGeocoding && (
        <span className="ml-1">• Geocoding by Nominatim</span>
      )}
    </div>
  )
}

