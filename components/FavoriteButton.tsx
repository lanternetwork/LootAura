'use client'
import { useFavorites, useToggleFavorite } from '@/lib/hooks/useAuth'
import { AiFillHeart, AiOutlineHeart } from 'react-icons/ai'

export default function FavoriteButton({ 
  saleId, 
  initial = false
}: { 
  saleId: string
  initial?: boolean 
}) {
  const { data: favorites = [] } = useFavorites()
  const toggleFavorite = useToggleFavorite()
  
  const isFavorited = favorites.some((fav: any) => fav.id === saleId)

  const handleToggle = () => {
    toggleFavorite.mutate({ saleId, isFavorited })
  }

  return (
    <button
      type="button"
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Unsave sale' : 'Save sale'}
      disabled={toggleFavorite.isPending}
      className={`p-1 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-transparent`}
      onClick={handleToggle}
    >
      {isFavorited ? (
        <AiFillHeart className="text-rose-600" size={22} />
      ) : (
        <AiOutlineHeart className="text-neutral-500 hover:text-neutral-700" size={22} />
      )}
    </button>
  )
}
