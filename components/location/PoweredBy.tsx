'use client'

interface PoweredByProps {
  provider: 'google' | 'osm'
}

export default function PoweredBy({ provider }: PoweredByProps) {
  if (provider !== 'google') return null
  return (
    <div className="flex justify-end mt-1 pr-2">
      <span className="text-[10px] text-gray-500">Powered by Google</span>
    </div>
  )
}


