'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function HeroSearchBar() {
  const router = useRouter()
  const [zip, setZip] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (zip.trim()) {
      router.push(`/sales?zip=${encodeURIComponent(zip.trim())}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[560px]">
      <div className="flex gap-2 bg-white rounded-full shadow-md p-2">
        <input
          type="text"
          placeholder="Enter ZIP or city"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          className="flex-1 bg-transparent px-5 py-3 text-aura-navy placeholder:text-aura-navy/50 focus:outline-none text-base"
        />
        <button
          type="submit"
          className="rounded-full bg-aura-gold text-aura-navy px-6 py-3 font-medium hover:bg-[#d39a2f] focus:outline-none focus:ring-2 focus:ring-aura-gold focus:ring-offset-2 transition-colors whitespace-nowrap"
        >
          Search
        </button>
      </div>
    </form>
  )
}

