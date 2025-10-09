'use client'
import { useFavorites } from '@/lib/hooks/useAuth'
import SalesList from '@/components/SalesList'
import EmptyState from '@/components/EmptyState'

export default function Favorites() {
  const { data: favorites = [], isLoading, error } = useFavorites()

  if (isLoading) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
          <div className="text-neutral-600">Loading favorites...</div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-4">
        <div className="text-center py-16 text-red-600">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-lg font-medium">Error loading favorites</div>
          <div className="text-sm mt-2">{error.message}</div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Your Favorites</h1>
        <p className="text-neutral-600">
          {favorites.length} saved sale{favorites.length !== 1 ? 's' : ''}
        </p>
      </div>

      {favorites.length === 0 ? (
        <EmptyState 
          title="No favorites yet"
          cta={
            <div className="space-y-2">
              <p className="text-sm text-neutral-500">
                Start browsing sales and save the ones you're interested in.
              </p>
              <a 
                href="/sales" 
                className="inline-block text-amber-600 hover:text-amber-700 font-medium"
              >
                Browse Sales →
              </a>
            </div>
          }
        />
      ) : (
        <SalesList sales={favorites} />
      )}
    </main>
  )
}
