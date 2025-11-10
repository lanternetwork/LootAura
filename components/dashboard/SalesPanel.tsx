'use client'

import { useState, useEffect, useMemo } from 'react'
import { FaPlus } from 'react-icons/fa'
import Link from 'next/link'
import DashboardSaleCard from './DashboardSaleCard'
import { Sale } from '@/lib/types'

interface SalesPanelProps {
  sales: Sale[]
  onSaleDelete?: (saleId: string) => void
}

type TabType = 'live' | 'archived'

export default function SalesPanel({ sales, onSaleDelete }: SalesPanelProps) {
  const [localSales, setLocalSales] = useState<Sale[]>(sales)
  const [activeTab, setActiveTab] = useState<TabType>('live')

  // Sync local sales with prop changes
  useEffect(() => {
    setLocalSales(sales)
  }, [sales])

  // Filter sales based on active tab
  const filteredSales = useMemo(() => {
    if (activeTab === 'live') {
      return localSales.filter((sale) => sale.status === 'published')
    } else {
      return localSales.filter((sale) => sale.status === 'completed')
    }
  }, [localSales, activeTab])

  // Calculate counts for each tab
  const liveCount = useMemo(() => localSales.filter((s) => s.status === 'published').length, [localSales])
  const archivedCount = useMemo(() => localSales.filter((s) => s.status === 'completed').length, [localSales])

  const handleSaleDelete = (saleId: string) => {
    setLocalSales((prev) => prev.filter((s) => s.id !== saleId))
    if (onSaleDelete) {
      onSaleDelete(saleId)
    }
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Your Sales</h2>
          </div>
          <Link
            href="/sell/new"
            className="btn-accent flex items-center gap-1 text-sm"
            aria-label="Create new sale"
          >
            <FaPlus className="w-4 h-4" />
            Create New Sale
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'live'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Live
            {liveCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                {liveCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'archived'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Archived
            {archivedCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                {archivedCount}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        {filteredSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">
              {activeTab === 'live'
                ? 'No live sales yet. Create your first sale.'
                : 'No archived sales yet.'}
            </p>
            {activeTab === 'live' && (
              <Link href="/sell/new" className="btn-accent inline-flex items-center gap-1">
                <FaPlus className="w-4 h-4" />
                Create New Sale
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSales.map((sale) => (
              <DashboardSaleCard key={sale.id} sale={sale} onDelete={handleSaleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

