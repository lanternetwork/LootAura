'use client'
import { useState } from 'react'

export default function SetupReviewsPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const setupReviewsTable = async () => {
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/setup-reviews-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({ ok: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Setup Reviews Table</h1>

      <div className="mb-8 p-4 border rounded-lg shadow-sm bg-base-100">
        <h2 className="text-xl font-semibold mb-4">Create Reviews Table</h2>
        <p className="mb-4">
          This will create the lootaura_v2.reviews table and set up the dual-link review system.
        </p>
        <button className="btn btn-primary" onClick={setupReviewsTable} disabled={loading}>
          {loading ? 'Setting up...' : 'Setup Reviews Table'}
        </button>

        {result && (
          <div className="mt-4 p-4 border rounded-lg bg-base-200">
            {result.ok ? (
              <>
                <p className="text-success-content"><strong>Success:</strong> {result.message}</p>
                <p><strong>Test Access:</strong> {result.test_access ? '✅ Working' : '❌ Failed'}</p>
              </>
            ) : (
              <p className="text-error-content"><strong>Error:</strong> {result.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border rounded-lg shadow-sm bg-base-100">
        <h2 className="text-xl font-semibold mb-4">Correct Sale IDs for Testing</h2>
        <p className="mb-2">Use these sale IDs in the Admin Tools:</p>
        <ul className="list-disc list-inside ml-4 space-y-1">
          <li><code className="font-mono bg-gray-100 px-2 py-1 rounded">33333333-3333-3333-3333-333333333333</code> (User 1's sale)</li>
          <li><code className="font-mono bg-gray-100 px-2 py-1 rounded">44444444-4444-4444-4444-444444444444</code> (User 2's sale)</li>
        </ul>
        <p className="mt-4 text-sm text-gray-600">
          <strong>Note:</strong> Don't use the user IDs (11111111-1111-1111-1111-111111111111) - those are for users, not sales!
        </p>
      </div>
    </div>
  )
}
