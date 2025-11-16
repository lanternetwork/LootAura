'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function HeroSearchBar() {
  const [zip, setZip] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (zip.trim()) {
      router.push(`/sales?zip=${encodeURIComponent(zip.trim())}`)
    }
  }

  return (
    <form
      onSubmit={handleSearch}
      className="flex items-center gap-1 sm:gap-2 bg-white rounded-full shadow px-2 sm:px-3 py-2 w-full max-w-[560px]"
    >
      <input
        type="text"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        placeholder="Enter ZIP or city"
        className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-[#3A2268] placeholder:text-[#3A2268]/50 text-sm sm:text-base"
      />
      <button
        type="submit"
        className="bg-[#F4B63A] hover:bg-[#dca32f] text-[#3A2268] font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-full transition-colors whitespace-nowrap text-sm sm:text-base shrink-0"
      >
        Find sales
      </button>
    </form>
  )
}

