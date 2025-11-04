'use client'

import { useState } from 'react'

interface CreatedSale {
  id: string
  title: string
  status: string
  date_start: string
}

export default function TestSalesGenerator() {
  const [loading, setLoading] = useState(false)
  const [createdSales, setCreatedSales] = useState<CreatedSale[]>([])
  const [error, setError] = useState<string | null>(null)

  const generateTestSale = async (status: 'published' | 'draft' | 'archived', daysOffset: number = 0) => {
    const today = new Date()
    const saleDate = new Date(today)
    saleDate.setDate(today.getDate() + daysOffset)
    
    const dateStr = saleDate.toISOString().split('T')[0]
    const timeStart = '09:00:00'
    const timeEnd = '17:00:00'
    
    // Generate a random title
    const titles = [
      'Community Yard Sale',
      'Estate Sale - Everything Must Go',
      'Moving Sale',
      'Garage Sale - Great Finds',
      'Weekend Yard Sale',
      'Multi-Family Sale',
      'Antique & Collectibles Sale',
      'Holiday Clearance Sale'
    ]
    const title = titles[Math.floor(Math.random() * titles.length)]
    
    // Use Louisville coordinates (you can change this)
    const lat = 38.2527
    const lng = -85.7585
    
    const saleData = {
      title: `${title} - ${status}`,
      description: `Test sale for ${status} status. Created on ${dateStr}.`,
      address: `${Math.floor(Math.random() * 9999)} Main St`,
      city: 'Louisville',
      state: 'KY',
      zip_code: '40202',
      lat,
      lng,
      date_start: dateStr,
      time_start: timeStart,
      date_end: dateStr,
      time_end: timeEnd,
      status: status === 'published' ? 'published' : status === 'draft' ? 'draft' : 'archived',
      pricing_mode: 'negotiable'
    }

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleData)
      })

      const data = await response.json()
      
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create sale')
      }

      return data.sale as CreatedSale
    } catch (err) {
      throw err
    }
  }

  const createTestSales = async () => {
    setLoading(true)
    setError(null)
    setCreatedSales([])

    try {
      const sales: CreatedSale[] = []
      
      // Create 2 published sales (today and tomorrow)
      for (let i = 0; i < 2; i++) {
        const sale = await generateTestSale('published', i)
        sales.push(sale)
      }
      
      // Create 1 draft sale (next week)
      const draftSale = await generateTestSale('draft', 7)
      sales.push(draftSale)
      
      // Create 1 archived sale (last week)
      const archivedSale = await generateTestSale('archived', -7)
      sales.push(archivedSale)
      
      setCreatedSales(sales)
    } catch (err: any) {
      setError(err.message || 'Failed to create test sales')
      console.error('Error creating test sales:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Test Sales Generator</h3>
      <p className="text-sm text-gray-600 mb-4">
        Create test sales for your account to test the profile listings functionality.
        This will create 4 sales: 2 published (today/tomorrow), 1 draft (next week), and 1 archived (last week).
      </p>
      
      <button
        onClick={createTestSales}
        disabled={loading}
        className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating Test Sales...' : 'Create Test Sales'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 font-medium">Error:</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {createdSales.length > 0 && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800 font-medium mb-2">
            ✅ Created {createdSales.length} test sales:
          </p>
          <div className="space-y-2">
            {createdSales.map((sale) => (
              <div key={sale.id} className="text-sm bg-white p-2 rounded border">
                <div className="font-medium">{sale.title}</div>
                <div className="text-gray-600">
                  Status: <span className="font-medium">{sale.status}</span> | Date: {sale.date_start}
                </div>
              </div>
            ))}
          </div>
          <p className="text-green-800 text-sm mt-3">
            Check your profile page to see these sales in the listings tabs!
          </p>
        </div>
      )}
    </div>
  )
}

