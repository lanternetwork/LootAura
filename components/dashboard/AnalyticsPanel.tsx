'use client'

import type { Metrics7d } from '@/lib/data/profileAccess'
import { useMemo } from 'react'
import { Area, AreaChart, XAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface AnalyticsPanelProps {
  metrics7d?: Metrics7d | null
  loading?: boolean
}

interface MetricChartProps {
  data: number[]
  color?: string
  dataKey?: string
}

function MetricChart({ data, color = '#3b82f6', dataKey = 'value' }: MetricChartProps) {
  // Generate unique gradient ID to avoid conflicts when multiple charts render
  const gradientId = useMemo(() => `gradient-${dataKey}-${Math.random().toString(36).substring(7)}`, [dataKey])
  
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    return data.map((value, index) => ({
      index,
      [dataKey]: value,
    }))
  }, [data, dataKey])

  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-neutral-400 text-xs" style={{ height: '60px' }}>
        No data
      </div>
    )
  }

  const config = {
    [dataKey]: {
      label: 'Value',
      color,
    },
  }

  return (
    <ChartContainer config={config} className="h-[60px] w-full">
      <AreaChart
        data={chartData}
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="index" hide />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
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
        <MetricChart data={data} color={color} />
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

