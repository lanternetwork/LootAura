'use client'

import { useState } from 'react'

interface SalesTestResult {
  totalSales: number
  salesInBbox: number
  salesInCity: number
  salesInDateRange: number
  sampleSales: any[]
  error?: string
}

export default function SalesDataTester() {
  const [zipCode, setZipCode] = useState('40204')
  const [dateRange, setDateRange] = useState('any')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SalesTestResult | null>(null)

  const testSalesData = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/test-sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zipCode,
          dateRange
        })
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        totalSales: 0,
        salesInBbox: 0,
        salesInCity: 0,
        salesInDateRange: 0,
        sampleSales: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Sales Data Tester</h3>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ZIP Code
            </label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="40204"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="any">Any</option>
              <option value="today">Today</option>
              <option value="weekend">This Weekend</option>
              <option value="next_weekend">Next Weekend</option>
            </select>
          </div>
        </div>

        <button
          onClick={testSalesData}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Testing...' : 'Test Sales Data'}
        </button>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <h4 className="font-semibold mb-3">Test Results</h4>
            
            {result.error ? (
              <div className="text-red-600">
                <p className="font-medium">Error:</p>
                <p>{result.error}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total Sales:</span>
                    <br />
                    <span className="text-2xl font-bold text-blue-600">{result.totalSales}</span>
                  </div>
                  <div>
                    <span className="font-medium">In Bbox:</span>
                    <br />
                    <span className="text-2xl font-bold text-green-600">{result.salesInBbox}</span>
                  </div>
                  <div>
                    <span className="font-medium">In City:</span>
                    <br />
                    <span className="text-2xl font-bold text-purple-600">{result.salesInCity}</span>
                  </div>
                  <div>
                    <span className="font-medium">In Date Range:</span>
                    <br />
                    <span className="text-2xl font-bold text-orange-600">{result.salesInDateRange}</span>
                  </div>
                </div>

                {result.sampleSales.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium mb-2">Sample Sales:</p>
                    <div className="max-h-40 overflow-y-auto">
                      {result.sampleSales.map((sale, index) => (
                        <div key={index} className="text-xs bg-white p-2 rounded border mb-1">
                          <div className="font-medium">{sale.title}</div>
                          <div className="text-gray-600">
                            {sale.city}, {sale.state} - {sale.date_start}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

