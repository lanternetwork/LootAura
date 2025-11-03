'use client'
import { useFavorites, useToggleFavorite, useAuth } from '@/lib/hooks/useAuth'
import { useState } from 'react'
import { AiFillHeart, AiOutlineHeart } from 'react-icons/ai'
import { useRouter } from 'next/navigation'

export default function FavoriteButton({ 
  saleId, 
  initial: _initial = false
}: { 
  saleId: string
  initial?: boolean 
}) {
  const router = useRouter()
  const { data: user } = useAuth()
  const { data: favorites = [] } = useFavorites()
  const toggleFavorite = useToggleFavorite()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  
  const isFavorited = favorites.some((fav: any) => fav.id === saleId)
  const displayFavorited = optimistic ?? isFavorited

  const handleToggle = () => {
    // If user is not authenticated, redirect to login
    if (!user) {
      router.push('/auth/signin?redirectTo=' + encodeURIComponent(window.location.pathname))
      return
    }
    // Optimistic UI
    setOptimistic(!isFavorited)
    toggleFavorite
      .mutateAsync({ saleId, isFavorited })
      .then(() => {
        // fall back to cache after success
        setOptimistic(null)
      })
      .catch(() => {
        // rollback on error
        setOptimistic(null)
      })
  }

  return (
    <button
      type="button"
      aria-pressed={displayFavorited}
      aria-label={displayFavorited ? 'Unsave sale' : 'Save sale'}
      disabled={toggleFavorite.isPending}
      className={`p-1 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-transparent`}
      onClick={handleToggle}
    >
      {displayFavorited ? (
        <AiFillHeart className="text-rose-600" size={22} />
      ) : (
        <AiOutlineHeart className="text-neutral-500 hover:text-neutral-700" size={22} />
      )}
    </button>
  )
}
