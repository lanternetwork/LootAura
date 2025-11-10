'use client'

import type { Metrics7d } from '@/lib/data/profileAccess'
import { useMemo } from 'react'

interface AnalyticsPanelProps {
  metrics7d?: Metrics7d | null
  loading?: boolean
}

interface SimpleLineChartProps {
  data: number[]
  color?: string
  height?: number
}

function SimpleLineChart({ data, color = '#3b82f6', height = 60 }: SimpleLineChartProps) {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-neutral-400 text-xs" style={{ height: `${height}px` }}>
        No data
      </div>
    )
  }

  const maxValue = Math.max(...data, 1)
  const minValue = Math.min(...data, 0)
  const range = maxValue - minValue || 1

  const gradientId = useMemo(() => {
    return `gradient-${color.replace('#', '')}`
  }, [color])

  const points = useMemo(() => {
    if (data.length === 1) {
      // Single point - draw a horizontal line
      return `0,50 100,50`
    }
    return data.map((value, index) => {
      const x = (index / (data.length - 1 || 1)) * 100
      const y = 100 - ((value - minValue) / range) * 100
      return `${x},${y}`
    }).join(' ')
  }, [data, minValue, range])

  const pathData = `M ${points}`

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path
          d={`${pathData} L 100,100 L 0,100 Z`}
          fill={`url(#${gradientId})`}
        />
        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Data points */}
        {data.map((value, index) => {
          const x = (index / (data.length - 1 || 1)) * 100
          const y = 100 - ((value - minValue) / range) * 100
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="2"
              fill={color}
            />
          )
        })}
      </svg>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string | number
  data: number[]
  color?: string
}

function MetricCard({ title, value, data, color = '#3b82f6' }: MetricCardProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-neutral-600">{title}</h3>
        </div>
        <div className="text-2xl font-semibold text-neutral-900 mb-3">{value}</div>
        <SimpleLineChart data={data} color={color} height={60} />
      </div>
    </div>
  )
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
    series: [],
  }

  // Extract time series data for each metric
  const viewsData = metrics.series?.map(d => d.views) || []
  const savesData = metrics.series?.map(d => d.saves) || []
  const clicksData = metrics.series?.map(d => d.clicks) || []
  const ctrData = metrics.series?.map(d => {
    const views = d.views || 0
    const clicks = d.clicks || 0
    return views > 0 ? (clicks / views) * 100 : 0
  }) || []
  const fulfilledData = metrics.series?.map(d => d.fulfilled) || []

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Analytics (7 days)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Views"
            value={metrics.views7d ?? 0}
            data={viewsData}
            color="#3b82f6"
          />
          <MetricCard
            title="Saves"
            value={metrics.saves7d ?? 0}
            data={savesData}
            color="#10b981"
          />
          <MetricCard
            title="CTR"
            value={metrics.ctr7d ? `${metrics.ctr7d.toFixed(1)}%` : '0%'}
            data={ctrData}
            color="#f59e0b"
          />
          <MetricCard
            title="Fulfilled"
            value={metrics.salesFulfilled ?? 0}
            data={fulfilledData}
            color="#8b5cf6"
          />
        </div>
      </div>
    </div>
  )
}

