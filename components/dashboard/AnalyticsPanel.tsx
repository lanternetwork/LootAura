'use client'

import type { Metrics7d } from '@/lib/data/profileAccess'

interface AnalyticsPanelProps {
  metrics7d?: Metrics7d | null
  loading?: boolean
}

export default function AnalyticsPanel({ metrics7d, loading }: AnalyticsPanelProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-body-lg">
          <h2 className="card-title mb-4">Analytics</h2>
          <div className="text-neutral-600">Loading metrics...</div>
        </div>
      </div>
    )
  }

  const metrics = metrics7d || {
    views7d: 0,
    saves7d: 0,
    ctr7d: 0,
    salesFulfilled: 0,
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Analytics (7 days)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{metrics.views7d ?? 0}</div>
            <div className="text-sm text-neutral-600">Views</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{metrics.saves7d ?? 0}</div>
            <div className="text-sm text-neutral-600">Saves</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{metrics.ctr7d ? `${metrics.ctr7d.toFixed(1)}%` : '0%'}</div>
            <div className="text-sm text-neutral-600">CTR</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{metrics.salesFulfilled ?? 0}</div>
            <div className="text-sm text-neutral-600">Fulfilled</div>
          </div>
        </div>
      </div>
    </div>
  )
}

