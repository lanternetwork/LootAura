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
  initialArchivedCount?: number // Initial count for archived sales tab badge
  promotionsEnabled?: boolean
  paymentsEnabled?: boolean
}

type TabType = 'live' | 'archived' | 'drafts'

type PromotionStatus = {
  sale_id: string
  is_active: boolean
  ends_at: string | null
  tier: string | null
}

export default function SalesPanel({ 
  sales, 
  drafts = [],
  isLoadingDrafts = false,
  draftsError,
  onSaleDelete,
  onDraftDelete,
  onDraftPublish,
  onRetryDrafts,
  initialArchivedCount = 0,
  promotionsEnabled = false,
  paymentsEnabled = false,
}: SalesPanelProps) {
  const [localSales, setLocalSales] = useState<Sale[]>(sales)
  const [archivedSales, setArchivedSales] = useState<Sale[]>([])
  const [isLoadingArchived, setIsLoadingArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState<number>(initialArchivedCount)
  const [activeTab, setActiveTab] = useState<TabType>('live')
  const [promotionStatuses, setPromotionStatuses] = useState<Record<string, PromotionStatus>>({})
  const [isLoadingPromotions, setIsLoadingPromotions] = useState(false)

  // Sync local sales with prop changes (active sales)
  useEffect(() => {
    setLocalSales(sales)
  }, [sales])

  // Fetch promotion statuses once for current live sales (no N+1)
  useEffect(() => {
    if (!promotionsEnabled) {
      setPromotionStatuses({})
      return
    }

    const liveSales = (sales || []).filter((sale) => sale.status === 'published')
    if (liveSales.length === 0) {
      setPromotionStatuses({})
      return
    }

    const saleIds = liveSales.map((s) => s.id).join(',')
    setIsLoadingPromotions(true)

    fetch(`/api/promotions/status?sale_ids=${encodeURIComponent(saleIds)}`)
      .then(async (res) => {
        if (!res.ok) {
          return
        }
        const json = await res.json().catch(() => null)
        if (!json || !Array.isArray(json.statuses)) {
          return
        }
        // Defensive: aggregate multiple entries for same sale_id (shouldn't happen after API fix, but be resilient)
        const map: Record<string, PromotionStatus> = {}
        const statusesBySaleId = new Map<string, PromotionStatus[]>()
        
        // Group statuses by sale_id
        for (const status of json.statuses as PromotionStatus[]) {
          if (status?.sale_id) {
            if (!statusesBySaleId.has(status.sale_id)) {
              statusesBySaleId.set(status.sale_id, [])
            }
            statusesBySaleId.get(status.sale_id)!.push(status)
          }
        }
        
        // Aggregate: for each sale_id, use any active entry, max ends_at among active entries
        for (const [saleId, statuses] of statusesBySaleId.entries()) {
          const hasActive = statuses.some((s) => s.is_active === true)
          const activeStatuses = statuses.filter((s) => s.is_active === true)
          const maxEndsAt = activeStatuses.reduce((max: string | null, s) => {
            if (!s.ends_at) return max
            if (!max) return s.ends_at
            return s.ends_at > max ? s.ends_at : max
          }, null as string | null)
          
          // Use the first status as base, but override with aggregated values
          const baseStatus = statuses[0]
          const tierWithMaxEndsAt = activeStatuses.find((s) => s.ends_at === maxEndsAt)?.tier
          map[saleId] = {
            sale_id: saleId,
            is_active: hasActive,
            ends_at: hasActive ? (maxEndsAt ?? null) : null,
            tier: hasActive ? (tierWithMaxEndsAt ?? baseStatus.tier) : null,
          }
        }
        
        setPromotionStatuses(map)
      })
      .catch(() => {
        // Silent failure - promotions are non-critical
      })
      .finally(() => {
        setIsLoadingPromotions(false)
      })
    // We only want to refetch when the list of sale IDs changes or gating changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionsEnabled, sales.map((s) => s.id).join(',')])

  // Prefetch archived sales in the background after a short delay
  // This makes the tab feel faster when clicked
  useEffect(() => {
    // Only prefetch if we have archived sales (count > 0) and haven't loaded them yet
    if (archivedCount > 0 && archivedSales.length === 0 && !isLoadingArchived && activeTab !== 'archived') {
      // Prefetch after 2 seconds (don't block initial render)
      const timer = setTimeout(() => {
        fetch('/api/profile/listings?status=archived&limit=50')
          .then((res) => res.json())
          .then((data) => {
            if (data.items && Array.isArray(data.items)) {
              setArchivedSales(data.items as Sale[])
              // Update count from actual data if available
              if (data.total !== undefined) {
                setArchivedCount(data.total)
              }
            }
          })
          .catch(() => {
            // Silently fail - prefetch is not critical
          })
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [archivedCount, archivedSales.length, isLoadingArchived, activeTab])

  // Fetch archived sales when archived tab is activated (if not already prefetched)
  useEffect(() => {
    if (activeTab === 'archived' && archivedSales.length === 0 && !isLoadingArchived) {
      setIsLoadingArchived(true)
      fetch('/api/profile/listings?status=archived&limit=50')
        .then((res) => res.json())
        .then((data) => {
          if (data.items && Array.isArray(data.items)) {
            setArchivedSales(data.items as Sale[])
            // Update count from actual data if available
            if (data.total !== undefined) {
              setArchivedCount(data.total)
            }
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
  // Use state for archived count (initialized from props, updated when data loads)
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
              <DashboardSaleCard
                key={sale.id}
                sale={sale}
                onDelete={handleSaleDelete}
                promotionsEnabled={promotionsEnabled}
                paymentsEnabled={paymentsEnabled}
                promotionStatus={promotionStatuses[sale.id]}
                isPromotionLoading={isLoadingPromotions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

