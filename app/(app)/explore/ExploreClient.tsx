'use client'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import NavTabs from '@/components/NavTabs'
import SearchFilters from '@/components/SearchFilters'
import VirtualizedSalesList from '@/components/VirtualizedSalesList'
import nextDynamic from 'next/dynamic'
import AddSaleForm from '@/components/AddSaleForm'
import ImportSales from '@/components/ImportSales'
import { useSales } from '@/lib/hooks/useSales'
import { Filters } from '@/state/filters'
import { Sale } from '@/lib/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import EnvironmentCheck from '@/components/EnvironmentCheck'
import ConnectionDiagnostics from '@/components/ConnectionDiagnostics'
import OfflineIndicator from '@/components/OfflineIndicator'

const YardSaleMap = nextDynamic(() => import('@/components/YardSaleMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] w-full rounded-2xl bg-neutral-200 flex items-center justify-center">Loading map...</div>
  ),
})

export default function ExploreClient() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>({ q: '', maxKm: 25, tags: [] })

  const tab = (searchParams.get('tab') as 'list' | 'map' | 'add' | 'find') || 'list'

  const { data: sales = [], isLoading, error } = useSales(filters)

  const mapPoints = useMemo(
    () => (sales as Sale[]).filter(s => s.lat && s.lng).map(s => ({ id: s.id, title: s.title, lat: s.lat!, lng: s.lng! })),
    [sales]
  )

  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">Explore Yard Sales</h1>
      <p className="text-neutral-600 mb-4">Browse, search, and discover amazing deals in your neighborhood.</p>

      <OfflineIndicator />
      <EnvironmentCheck />
      
      {error && <ConnectionDiagnostics />}

      <NavTabs />

      <div className="mb-6">
        <SearchFilters onChange={setFilters} showAdvanced={tab === 'list'} />
      </div>

      <ErrorBoundary fallback={
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-medium">Error loading sales</h3>
          <p className="text-red-600 text-sm mt-1">
            There was a problem loading the sales data. Please check your internet connection and try again.
          </p>
        </div>
      }>
        {tab === 'list' && (
          <div>
            <div className="mb-4 text-sm text-neutral-600">
              {isLoading ? 'Loading...' : `${sales.length} sales found`}
            </div>
            <VirtualizedSalesList sales={sales} isLoading={isLoading} error={error} />
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
      </ErrorBoundary>
    </main>
  )
}


