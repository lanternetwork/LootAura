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
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <input
        type="text"
        placeholder="Enter ZIP or city"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        className="flex-1 rounded-full border border-aura-navy/20 bg-white px-5 py-2.5 text-aura-navy placeholder:text-aura-navy/50 focus:outline-none focus:ring-2 focus:ring-aura-gold focus:border-aura-gold"
      />
      <button
        type="submit"
        className="rounded-full bg-[var(--aura-gold,#F4B63A)] text-[var(--aura-navy,#3A2268)] px-6 py-2.5 font-medium hover:bg-[#d39a2f] focus:outline-none focus:ring-2 focus:ring-aura-gold focus:ring-offset-2 transition-colors"
      >
        Find sales
      </button>
    </form>
  )
}

