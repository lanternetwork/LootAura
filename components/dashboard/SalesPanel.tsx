'use client'

import { useState, useEffect, useMemo } from 'react'
import { FaPlus, FaSync, FaExclamationCircle } from 'react-icons/fa'
import Link from 'next/link'
import DashboardSaleCard from './DashboardSaleCard'
import DraftCard from './DraftCard'
import { Sale } from '@/lib/types'
import type { DraftListing } from '@/lib/data/salesAccess'

interface SalesPanelProps {
  sales: Sale[] // Active sales (for Live tab)
  drafts?: DraftListing[]
  isLoadingDrafts?: boolean
  draftsError?: any
  onSaleDelete?: (saleId: string) => void
  onDraftDelete?: (draftKey: string) => void
  onDraftPublish?: (draftKey: string, saleId: string) => void
  onRetryDrafts?: () => void
}

type TabType = 'live' | 'archived' | 'drafts'

export default function SalesPanel({ 
  sales, 
  drafts = [],
  isLoadingDrafts = false,
  draftsError,
  onSaleDelete,
  onDraftDelete,
  onDraftPublish,
  onRetryDrafts,
}: SalesPanelProps) {
  const [localSales, setLocalSales] = useState<Sale[]>(sales)
  const [archivedSales, setArchivedSales] = useState<Sale[]>([])
  const [isLoadingArchived, setIsLoadingArchived] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('live')

  // Sync local sales with prop changes (active sales)
  useEffect(() => {
    setLocalSales(sales)
  }, [sales])

  // Fetch archived sales when archived tab is activated
  useEffect(() => {
    if (activeTab === 'archived' && archivedSales.length === 0 && !isLoadingArchived) {
      setIsLoadingArchived(true)
      fetch('/api/profile/listings?status=archived&limit=50')
        .then((res) => res.json())
        .then((data) => {
          if (data.items && Array.isArray(data.items)) {
            setArchivedSales(data.items as Sale[])
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[SALES_PANEL] Error fetching archived sales:', err)
          }
        })
        .finally(() => {
          setIsLoadingArchived(false)
        })
    }
  }, [activeTab, archivedSales.length, isLoadingArchived])

  // Filter sales based on active tab
  const filteredSales = useMemo(() => {
    if (activeTab === 'live') {
      return localSales.filter((sale) => sale.status === 'published')
    } else if (activeTab === 'archived') {
      return archivedSales // Use server-filtered archived sales
    }
    return []
  }, [localSales, archivedSales, activeTab])

  // Calculate counts for each tab
  const liveCount = useMemo(() => localSales.filter((s) => s.status === 'published').length, [localSales])
  const archivedCount = archivedSales.length // Use fetched archived count
  const draftsCount = drafts.length

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
          <button
            onClick={() => setActiveTab('drafts')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'drafts'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Drafts
            {draftsCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                {draftsCount}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        {activeTab === 'drafts' ? (
          <>
            {/* Error State */}
            {draftsError && !isLoadingDrafts && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <FaExclamationCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-800 font-medium">Failed to load drafts</p>
                    <p className="text-xs text-red-600 mt-1">{draftsError.message || 'An error occurred'}</p>
                    {onRetryDrafts && (
                      <button
                        onClick={onRetryDrafts}
                        className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 flex items-center gap-1"
                        aria-label="Retry loading drafts"
                      >
                        <FaSync className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoadingDrafts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="card-body">
                      <div className="w-full h-32 bg-gray-200 rounded mb-3" />
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                      <div className="flex gap-2">
                        <div className="h-8 bg-gray-200 rounded flex-1" />
                        <div className="h-8 bg-gray-200 rounded w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">No drafts yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {drafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onDelete={onDraftDelete || (() => {})}
                    onPublish={onDraftPublish || (() => {})}
                  />
                ))}
              </div>
            )}
          </>
        ) : isLoadingArchived ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="card-body">
                  <div className="w-full h-32 bg-gray-200 rounded mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="flex gap-2">
                    <div className="h-8 bg-gray-200 rounded flex-1" />
                    <div className="h-8 bg-gray-200 rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">
              {activeTab === 'live'
                ? 'No live sales yet. Create your first sale.'
                : 'You don\'t have any archived sales from the last 12 months yet.'}
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

