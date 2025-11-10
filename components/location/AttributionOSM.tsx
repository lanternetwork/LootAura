'use client'

interface AttributionOSMProps {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
  className?: string
}

export default function AttributionOSM({ 
  position = 'bottom-right',
  className = '' 
}: AttributionOSMProps) {
  // Position mapping
  const positionClasses = {
    'top-right': 'top-2 right-2',
    'bottom-right': 'bottom-2 right-2',
    'top-left': 'top-2 left-2',
    'bottom-left': 'bottom-2 left-2'
  }

  return (
    <div 
      className={`absolute ${positionClasses[position]} z-[2] pointer-events-none ${className}`}
      role="contentinfo"
    >
      <div className="pointer-events-auto bg-white/80 dark:bg-zinc-900/80 rounded px-2 py-1 shadow opacity-80 hover:opacity-100 transition-opacity">
        <div className="text-[10px] leading-tight text-gray-700 dark:text-gray-300">
          <span>
            ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900 dark:hover:text-gray-100"
              aria-label="OpenStreetMap copyright information"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </span>
        </div>
      </div>
    </div>
  )
}

