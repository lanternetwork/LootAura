'use client'

import { useState, useEffect } from 'react'
import { Sale } from '@/lib/types'

interface WeekendStats {
  activeSales: number
  newThisWeek: number
}

export function WeekendStats() {
  const [stats, setStats] = useState<WeekendStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const now = new Date()
        
        // Fetch ALL active sales near Louisville, KY (40204) - no date filter
        // This gives us all published sales in the area, not just weekend ones
        const zip = '40204'
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        
        // Fetch sales in batches to get accurate count (API has 200 limit per request)
        const allSales: Sale[] = []
        let offset = 0
        const limit = 200 // API max limit
        let hasMore = true
        
        while (hasMore) {
          const url = `${baseUrl}/api/sales?near=1&zip=${zip}&radiusKm=25&limit=${limit}&offset=${offset}`
          const res = await fetch(url)
          const data = await res.json()
          
          // Handle different response formats
          const sales: Sale[] = data.sales || data.data || []
          allSales.push(...sales)
          
          // If we got fewer than the limit, we've reached the end
          if (sales.length < limit) {
            hasMore = false
          } else {
            offset += limit
            // Safety limit: stop after fetching 2000 sales (10 pages)
            if (allSales.length >= 2000) {
              hasMore = false
            }
          }
        }
        
        // Count all active sales in the area
        const activeSales = allSales.length
        
        // Calculate new this week (sales created in last 7 days)
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        const newThisWeek = allSales.filter((sale) => {
          if (!sale.created_at) return false
          const created = new Date(sale.created_at)
          return created >= weekAgo
        }).length

        setStats({ activeSales, newThisWeek })
      } catch (error) {
        console.error('Failed to fetch weekend stats:', error)
        // Use fallback values
        setStats({ activeSales: 12, newThisWeek: 3 })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  // Show fallback values while loading or on error
  const displayStats = stats || { activeSales: 12, newThisWeek: 3 }

  return (
    <div className="bg-white/70 backdrop-blur rounded-2xl border border-white/40 p-4">
      <p className="text-sm text-[#3A2268]/70 mb-2">This weekend near</p>
      <p className="text-lg font-semibold text-[#3A2268] mb-3">Louisville, KY</p>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#3A2268]/70">Active sales</span>
          <span className="text-base font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.activeSales}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#3A2268]/70">New this week</span>
          <span className="text-base font-semibold text-[#3A2268]">
            {loading ? '...' : displayStats.newThisWeek}
          </span>
        </div>
      </div>
    </div>
  )
}

