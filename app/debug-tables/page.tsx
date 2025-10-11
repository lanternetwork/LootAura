'use client'
import { useState } from 'react'

export default function DebugTablesPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testTables = async () => {
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/debug-tables')
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
      <h1 className="text-3xl font-bold mb-6">Debug Tables Access</h1>

      <div className="mb-8 p-4 border rounded-lg shadow-sm bg-base-100">
        <h2 className="text-xl font-semibold mb-4">Test Table Access</h2>
        <p className="mb-4">
          This will test which tables are accessible and where the sale data is located.
        </p>
        <button className="btn btn-primary" onClick={testTables} disabled={loading}>
          {loading ? 'Testing...' : 'Test Tables'}
        </button>

        {result && (
          <div className="mt-4 p-4 border rounded-lg bg-base-200">
            {result.ok ? (
              <>
                <h3 className="font-semibold mb-2">Table Access Results:</h3>
                {result.table_tests?.map((test: any, index: number) => (
                  <div key={index} className="mb-2 p-2 border rounded">
                    <p><strong>{test.name}:</strong> {test.accessible ? '✅ Accessible' : '❌ Not accessible'}</p>
                    {test.error && <p className="text-red-500 text-sm">Error: {test.error}</p>}
                    <p className="text-sm">Data count: {test.data_count}</p>
                  </div>
                ))}
                
                <h3 className="font-semibold mb-2 mt-4">Sale Lookup Results:</h3>
                <p><strong>Sale ID:</strong> {result.sale_id}</p>
                <p><strong>Sale Found:</strong> {result.sale_found ? '✅ Found' : '❌ Not found'}</p>
                {result.sale_error && <p className="text-red-500">Error: {result.sale_error}</p>}
              </>
            ) : (
              <p className="text-error-content"><strong>Error:</strong> {result.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
