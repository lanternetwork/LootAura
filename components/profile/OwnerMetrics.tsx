'use client'

type OwnerMetricsProps = {
  views7d?: number
  saves7d?: number
  ctr7d?: number
  salesFulfilled?: number
  loading?: boolean
}

export function OwnerMetrics({ views7d, saves7d, ctr7d, salesFulfilled, loading }: OwnerMetricsProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-body-lg">
          <h2 className="card-title mb-4">Metrics</h2>
          <div className="text-neutral-600">Loading metrics...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Metrics (7 days)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{views7d ?? 0}</div>
            <div className="text-sm text-neutral-600">Views</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{saves7d ?? 0}</div>
            <div className="text-sm text-neutral-600">Saves</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{ctr7d ? `${ctr7d.toFixed(1)}%` : '0%'}</div>
            <div className="text-sm text-neutral-600">CTR</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900">{salesFulfilled ?? 0}</div>
            <div className="text-sm text-neutral-600">Fulfilled</div>
          </div>
        </div>
      </div>
    </div>
  )
}

