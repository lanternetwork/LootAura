'use client'

import { useState } from 'react'

export interface DateRange {
  type: 'any' | 'today' | 'weekend' | 'next_weekend' | 'range'
  startDate?: string
  endDate?: string
}

interface DateSelectorProps {
  value: DateRange
  onChange: (dateRange: DateRange) => void
  className?: string
}

export default function DateSelector({ value, onChange, className = '' }: DateSelectorProps) {
  const [showCustomRange, setShowCustomRange] = useState(false)
  
  // Debug logging
  console.log('[DateSelector] Current value:', value)

  const handleTypeChange = (type: DateRange['type']) => {
    console.log('[DateSelector] handleTypeChange called with:', type)
    if (type === 'range') {
      setShowCustomRange(true)
      onChange({ type, startDate: '', endDate: '' })
    } else {
      setShowCustomRange(false)
      onChange({ type })
    }
    console.log('[DateSelector] onChange called with:', { type })
  }

  const handleCustomRangeChange = (field: 'startDate' | 'endDate', date: string) => {
    onChange({
      ...value,
      [field]: date
    })
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Date Range
        </label>
        <div className="space-y-2">
          {[
            { value: 'any', label: 'Any Date' },
            { value: 'today', label: 'Today' },
            { value: 'weekend', label: 'This Weekend' },
            { value: 'next_weekend', label: 'Next Weekend' },
            { value: 'range', label: 'Custom Range' }
          ].map((option) => (
            <label key={option.value} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
              value.type === option.value 
                ? 'bg-blue-50 border border-blue-200' 
                : 'hover:bg-gray-50'
            }`}>
              <div className="relative mr-3">
                <input
                  type="radio"
                  name="dateRange"
                  value={option.value}
                  checked={value.type === option.value}
                  onChange={() => handleTypeChange(option.value as DateRange['type'])}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  value.type === option.value 
                    ? 'border-blue-600 bg-blue-600' 
                    : 'border-gray-300 bg-white'
                }`}>
                  {value.type === option.value && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
              </div>
              <span className={`text-sm font-medium ${
                value.type === option.value ? 'text-blue-900' : 'text-gray-700'
              }`}>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {showCustomRange && (
        <div className="space-y-3 pl-6 border-l-2 border-blue-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={value.startDate || ''}
              onChange={(e) => handleCustomRangeChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={value.endDate || ''}
              onChange={(e) => handleCustomRangeChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
