'use client'
import { useState } from 'react'
import AdminTools from '@/components/AdminTools'

export default function TestDualReviewsPage() {
  const [testData, setTestData] = useState<any>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTestData = async () => {
    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/test-dual-reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.error)
      }

      setTestData(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Dual-Link Review System Test
        </h1>

        <div className="space-y-8">
          {/* Test Data Creation */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Create Test Data</h2>
            <p className="text-gray-600 mb-4">
              This will create two sales at the same address by different users, 
              with separate review sets to demonstrate the dual-link system.
            </p>
            
            <button
              onClick={createTestData}
              disabled={isCreating}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating Test Data...' : 'Create Test Data'}
            </button>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {testData && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                <h3 className="font-medium text-green-800 mb-2">Test Data Created Successfully!</h3>
                <div className="text-sm text-green-700">
                  <p><strong>Address:</strong> {testData.address.address}, {testData.address.city}, {testData.address.state}</p>
                  <p><strong>Sales Created:</strong> {testData.sales?.length || 0}</p>
                  <p><strong>Reviews Created:</strong> {testData.review_counts?.reduce((sum: number, rc: any) => sum + rc.review_count, 0) || 0}</p>
                </div>
                
                {testData.review_counts && (
                  <div className="mt-4">
                    <h4 className="font-medium text-green-800 mb-2">Review Key Analysis:</h4>
                    <div className="space-y-2">
                      {testData.review_counts.map((rc: any, index: number) => (
                        <div key={index} className="text-xs bg-white p-2 rounded border">
                          <p><strong>Sale:</strong> {rc.title}</p>
                          <p><strong>Review Key:</strong> <code className="text-xs">{rc.review_key}</code></p>
                          <p><strong>Review Count:</strong> {rc.review_count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Admin Tools */}
          <AdminTools />

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-6">
            <h3 className="font-medium text-blue-800 mb-2">How to Test the Dual-Link System</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700">
              <li>Click "Create Test Data" to create two sales at the same address by different users</li>
              <li>Use the "Review Key Debugging" tool above to look up each sale ID</li>
              <li>Notice that each sale has a different <code>review_key</code> even though they're at the same address</li>
              <li>Each sale will have its own separate set of reviews</li>
              <li>This proves that multiple users at the same address have distinct review sets</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
