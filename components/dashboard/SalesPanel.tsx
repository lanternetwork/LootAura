'use client'

import { useState, useEffect } from 'react'
import { FaPlus } from 'react-icons/fa'
import Link from 'next/link'
import DashboardSaleCard from './DashboardSaleCard'
import { Sale } from '@/lib/types'

interface SalesPanelProps {
  sales: Sale[]
  onSaleDelete?: (saleId: string) => void
}

export default function SalesPanel({ sales, onSaleDelete }: SalesPanelProps) {
  const [localSales, setLocalSales] = useState<Sale[]>(sales)

  // Sync local sales with prop changes
  useEffect(() => {
    setLocalSales(sales)
  }, [sales])

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
            {localSales.length > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                {localSales.length}
              </span>
            )}
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

        {/* Body */}
        {localSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No sales yet. Create your first sale.</p>
            <Link href="/sell/new" className="btn-accent inline-flex items-center gap-1">
              <FaPlus className="w-4 h-4" />
              Create New Sale
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {localSales.map((sale) => (
              <DashboardSaleCard key={sale.id} sale={sale} onDelete={handleSaleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

