'use client'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSales, useSaleMarkers } from '@/lib/hooks/useSales'
import { Filters } from '@/state/filters'

// Dynamic imports to avoid build issues
import dynamic from 'next/dynamic'

const NavTabs = dynamic(() => import('@/components/NavTabs'), { ssr: false })
const SearchFilters = dynamic(() => import('@/components/SearchFilters'), { ssr: false })
const VirtualizedSalesList = dynamic(() => import('@/components/VirtualizedSalesList'), { ssr: false })
const YardSaleMap = dynamic(() => import('@/components/YardSaleMap'), { ssr: false })
const AddSaleForm = dynamic(() => import('@/components/AddSaleForm'), { ssr: false })
const ImportSales = dynamic(() => import('@/components/ImportSales'), { ssr: false })

export default function Explore() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>({ q: '', maxKm: 25, tags: [] })
  
  const tab = searchParams.get('tab') as 'list' | 'map' | 'add' | 'find' || 'list'

  // Use React Query hook for data fetching
  const { data: sales = [], isLoading, error } = useSales(filters)
  const { data: markers = [] } = useSaleMarkers(filters)

  const mapPoints = useMemo(() => 
    markers
      .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
      .map(p => ({ id: p.id, title: p.title, lat: p.lat, lng: p.lng }))
  , [markers])

  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">Explore Yard Sales</h1>
      <p className="text-neutral-600 mb-4">Browse, search, and discover amazing deals in your neighborhood.</p>
      
      <NavTabs />
      
      <div className="mb-6">
        <SearchFilters onChange={setFilters} showAdvanced={tab === 'list'} />
      </div>

      {tab === 'list' && (
        <div>
          <div className="mb-4 text-sm text-neutral-600">
            {isLoading ? 'Loading...' : `${sales.length} sales found`}
          </div>
          <VirtualizedSalesList 
            sales={sales} 
            isLoading={isLoading} 
            error={error} 
          />
        </div>
      )}
      {tab === 'map' && <YardSaleMap points={mapPoints} />}
      {tab === 'add' && (
        <div id="add" className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-4">Post Your Sale</h2>
          <AddSaleForm />
        </div>
      )}
      {tab === 'find' && <ImportSales />}
    </main>
  )
}
