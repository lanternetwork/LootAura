'use client'

import { useState, useEffect } from 'react'
import { Sale } from '@/lib/types'

interface WeekendStatsData {
  activeSales: number
  newThisWeek: number
}

export function WeekendStats() {
  const [stats, setStats] = useState<WeekendStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Calculate this weekend's date range
        const now = new Date()
        const saturday = new Date(now)
        saturday.setDate(now.getDate() + (6 - now.getDay()))
        const sunday = new Date(saturday)
        sunday.setDate(saturday.getDate() + 1)
        
        const startDate = saturday.toISOString().split('T')[0]
        const endDate = sunday.toISOString().split('T')[0]

        // Fetch sales near Louisville, KY (40204) for this weekend
        const zip = '40204'
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        
        const url = `${baseUrl}/api/sales?near=1&zip=${zip}&radiusKm=25&from=${startDate}&to=${endDate}&limit=200`
        
        const res = await fetch(url)
        const data = await res.json()
        
        // Handle different response formats
        const sales: Sale[] = data.sales || data.data || []
        
        // Count active sales for this weekend
        const activeSales = sales.length
        
        // Calculate new this week (sales created in last 7 days)
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        const newThisWeek = sales.filter((sale) => {
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

