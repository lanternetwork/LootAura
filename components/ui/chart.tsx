'use client'

import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/utils'

// Chart container component
const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: Record<string, { label?: React.ReactNode; color?: string }>
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <div
      data-chart={chartId}
      ref={ref}
      className={cn('flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-neutral-500 [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-neutral-200 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-neutral-300 [&_.recharts-dot[stroke="#fff"]]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-neutral-300 [&_.recharts-radial-bar-background-sector]:fill-neutral-100 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-neutral-100 [&_.recharts-reference-line-line]:stroke-neutral-300 [&_.recharts-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none', className)}
      {...props}
    >
      <ChartStyle id={chartId} config={config} />
      <RechartsPrimitive.ResponsiveContainer>
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  )
})
ChartContainer.displayName = 'Chart'

const ChartStyle = ({ id, config }: { id: string; config: Record<string, { label?: React.ReactNode; color?: string }> }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.color)

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
          .filter(([, config]) => config.color)
          .map(([key, itemConfig]) => {
            const color = itemConfig.color
            return `[data-chart=${id}] .color-${key} { color: ${color}; }`
          })
          .join('\n'),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<'div'> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: 'line' | 'dot' | 'dashed'
      nameKey?: string
      labelKey?: string
    }
>(({ active, payload, className, indicator = 'dot', hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, nameKey, labelKey }, ref) => {
  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item.dataKey || item.name || 'value'}`
    const itemConfig = (item.payload as Record<string, unknown>)?.[key]

    if (labelFormatter) {
      return (
        <div className={cn('font-medium', labelClassName)}>
          {labelFormatter(label, payload)}
        </div>
      )
    }

    if (!label && !itemConfig) {
      return null
    }

    return (
      <div className={cn('font-medium', labelClassName)}>
        {label || (itemConfig && typeof itemConfig === 'object' && 'label' in itemConfig ? itemConfig.label : itemConfig)}
      </div>
    )
  }, [label, labelFormatter, payload, hideLabel, labelClassName, labelKey])

  if (!active || !payload?.length) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn('grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs shadow-md z-50', className)}
    >
      {tooltipLabel}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || 'value'}`
          const payloadRecord = item.payload as Record<string, unknown> | undefined
          const itemConfig = payloadRecord?.[key]
          const indicatorColor = (payloadRecord?.fill as string | undefined) || item.color

          return (
            <div
              key={item.dataKey}
              className={cn('flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-neutral-500', itemConfig?.className)}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {!hideIndicator && (
                    <div
                      className={cn('shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]', {
                        'my-0.5 w-1': indicator === 'line',
                        'mt-0.5 h-1.5 w-1.5 rounded-full': indicator === 'dot',
                        'my-0.5 h-px w-3 border': indicator === 'dashed',
                      })}
                      style={
                        {
                          '--color-bg': indicatorColor,
                          '--color-border': indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                  )}
                  <div
                    className={cn('flex flex-1 justify-between leading-none', {
                      'items-end': !hideIndicator,
                    })}
                  >
                    <div className="grid gap-1.5">
                      {itemConfig && typeof itemConfig === 'object' && 'label' in itemConfig ? (
                        itemConfig.label
                      ) : (
                        <span className="text-neutral-500">{itemConfig || item.name}</span>
                      )}
                    </div>
                    {item.value && (
                      <span className="font-mono font-medium tabular-nums text-neutral-950">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
ChartTooltipContent.displayName = 'ChartTooltipContent'

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> &
    Pick<RechartsPrimitive.LegendProps, 'payload' | 'verticalAlign'> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
  if (!payload?.length) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn('flex items-center justify-center gap-4', verticalAlign === 'top' ? 'pb-3' : 'pt-3', className)}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || 'value'}`
        const itemConfig = (item.payload as Record<string, unknown>)?.[key]

        return (
          <div
            key={item.value}
            className={cn('flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-neutral-500', itemConfig?.className)}
          >
            {!hideIcon && (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig && typeof itemConfig === 'object' && 'label' in itemConfig ? (
              itemConfig.label
            ) : (
              <span className="text-neutral-600">{itemConfig || item.value}</span>
            )}
          </div>
        )
      })}
    </div>
  )
})
ChartLegendContent.displayName = 'ChartLegendContent'

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent }

