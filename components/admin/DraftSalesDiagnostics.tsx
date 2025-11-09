'use client'

import { useState } from 'react'

// Generate UUID v4 using crypto.randomUUID (built-in)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface ApiResponse {
  ok: boolean
  data?: any
  saleId?: string
  error?: string
  code?: string
  details?: any
}

interface TestResult {
  action: string
  status: number
  elapsed: number
  request?: any
  response?: ApiResponse
  error?: string
}

export default function DraftSalesDiagnostics() {
  const [draftKey, setDraftKey] = useState(() => generateUUID())
  const [ownerNotes, setOwnerNotes] = useState('')
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const updateLoading = (action: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [action]: value }))
  }

  const updateResult = (action: string, result: TestResult) => {
    setResults((prev) => ({ ...prev, [action]: result }))
  }

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleDbPing = async () => {
    const action = 'dbPing'
    updateLoading(action, true)
    const start = Date.now()

    try {
      const response = await fetch('/api/_debug/db')
      const elapsed = Date.now() - start
      const data: ApiResponse = await response.json()

      updateResult(action, {
        action: 'DB Ping',
        status: response.status,
        elapsed,
        response: data,
      })
    } catch (error: any) {
      const elapsed = Date.now() - start
      updateResult(action, {
        action: 'DB Ping',
        status: 500,
        elapsed,
        error: error.message || 'Network error',
      })
    } finally {
      updateLoading(action, false)
    }
  }

  const handleSaveDraft = async () => {
    const action = 'saveDraft'
    updateLoading(action, true)
    const start = Date.now()

    const payload = {
      draftKey: draftKey,
      payload: {
        formData: {
          title: 'Diagnostics Sale',
          address: '123 Test St',
          city: 'Louisville',
          state: 'KY',
          zip_code: '40202',
          lat: 38.2527,
          lng: -85.7585,
          date_start: new Date().toISOString().split('T')[0],
          time_start: '12:00',
          date_end: new Date().toISOString().split('T')[0],
          time_end: '16:00',
          pricing_mode: 'negotiable',
          ...(ownerNotes && { ownerNotes }),
        },
        items: [
          {
            id: generateUUID(),
            name: 'Test Item',
            price: 5.0,
            category: 'furniture',
            image_url: 'https://dummyimage.com/400x300/ccc/000.jpg&text=diag',
          },
        ],
      },
    }

    try {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const elapsed = Date.now() - start
      const data: ApiResponse = await response.json()

      updateResult(action, {
        action: 'Save Draft',
        status: response.status,
        elapsed,
        request: payload,
        response: data,
      })
    } catch (error: any) {
      const elapsed = Date.now() - start
      updateResult(action, {
        action: 'Save Draft',
        status: 500,
        elapsed,
        request: payload,
        error: error.message || 'Network error',
      })
    } finally {
      updateLoading(action, false)
    }
  }

  const handlePublishDraft = async () => {
    const action = 'publishDraft'
    updateLoading(action, true)
    const start = Date.now()

    const payload = { draftKey }

    try {
      const response = await fetch('/api/drafts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const elapsed = Date.now() - start
      const data: ApiResponse = await response.json()

      updateResult(action, {
        action: 'Publish Draft',
        status: response.status,
        elapsed,
        request: payload,
        response: data,
      })
    } catch (error: any) {
      const elapsed = Date.now() - start
      updateResult(action, {
        action: 'Publish Draft',
        status: 500,
        elapsed,
        request: payload,
        error: error.message || 'Network error',
      })
    } finally {
      updateLoading(action, false)
    }
  }

  const handleCreateSaleDirect = async () => {
    const action = 'createSaleDirect'
    updateLoading(action, true)
    const start = Date.now()

    const payload = {
      title: 'Direct Sale (Diag)',
      description: ownerNotes || null,
      address: '123 Test St',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40202',
      lat: 38.2527,
      lng: -85.7585,
      date_start: new Date().toISOString().split('T')[0],
      time_start: '12:00',
      date_end: new Date().toISOString().split('T')[0],
      time_end: '16:00',
      pricing_mode: 'negotiable',
      status: 'published',
      privacy_mode: 'exact',
      cover_image_url: null,
      images: [],
      items: [
        {
          name: 'Direct Item',
          price: 7.0,
          category: 'furniture',
        },
      ],
    }

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const elapsed = Date.now() - start
      const data: ApiResponse = await response.json()

      updateResult(action, {
        action: 'Create Sale Direct',
        status: response.status,
        elapsed,
        request: payload,
        response: data,
      })
    } catch (error: any) {
      const elapsed = Date.now() - start
      updateResult(action, {
        action: 'Create Sale Direct',
        status: 500,
        elapsed,
        request: payload,
        error: error.message || 'Network error',
      })
    } finally {
      updateLoading(action, false)
    }
  }

  const clearResults = () => {
    setResults({})
    setExpanded({})
  }

  const generateNewDraftKey = () => {
    setDraftKey(generateUUID())
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600'
    if (status >= 400 && status < 500) return 'text-yellow-600'
    return 'text-red-600'
  }

  const resultEntries = Object.entries(results)

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Draft & Sales Diagnostics</h3>
      <p className="text-sm text-gray-600 mb-4">
        Quick-test endpoints for draft save, publish, and direct sale creation.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label htmlFor="draftKey" className="block text-sm font-medium text-gray-700 mb-1">
            Draft Key
          </label>
          <div className="flex rounded-md shadow-sm">
            <input
              type="text"
              id="draftKey"
              className="flex-1 block w-full rounded-none rounded-l-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              readOnly={loading['saveDraft'] || loading['publishDraft']}
            />
            <button
              type="button"
              onClick={generateNewDraftKey}
              className="-ml-px relative inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-r-md text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              disabled={loading['saveDraft'] || loading['publishDraft']}
            >
              Generate New
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="ownerNotes" className="block text-sm font-medium text-gray-700 mb-1">
            Owner Notes (optional, for Direct Sale)
          </label>
          <textarea
            id="ownerNotes"
            rows={2}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={ownerNotes}
            onChange={(e) => setOwnerNotes(e.target.value)}
            disabled={loading['createSaleDirect']}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <button
          onClick={handleDbPing}
          disabled={loading['dbPing']}
          className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading['dbPing'] ? 'Pinging...' : 'DB Ping'}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={loading['saveDraft']}
          className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
        >
          {loading['saveDraft'] ? 'Saving...' : 'Save Draft (fixture)'}
        </button>
        <button
          onClick={handlePublishDraft}
          disabled={loading['publishDraft']}
          className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
        >
          {loading['publishDraft'] ? 'Publishing...' : 'Publish Draft (by key)'}
        </button>
        <button
          onClick={handleCreateSaleDirect}
          disabled={loading['createSaleDirect']}
          className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
        >
          {loading['createSaleDirect'] ? 'Creating...' : 'Create Sale Direct (fixture)'}
        </button>
      </div>

      <div className="mb-4">
        <button
          onClick={clearResults}
          className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Clear Results
        </button>
      </div>

      {resultEntries.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Results:</h4>
          {resultEntries.map(([key, result]) => (
            <div key={key} className="border border-gray-200 rounded-md p-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpanded(key)}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-900">{result.action}</span>
                  <span className={`text-sm font-medium ${getStatusColor(result.status)}`}>
                    {result.status || 'Error'}
                  </span>
                  <span className="text-sm text-gray-500">{result.elapsed}ms</span>
                </div>
                <span className="text-gray-400">{expanded[key] ? '▼' : '▶'}</span>
              </div>

              {expanded[key] && (
                <div className="mt-4 space-y-3">
                  {result.request && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Request:</h4>
                      <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(result.request, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.response && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Response:</h4>
                      <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(result.response, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.error && (
                    <div>
                      <h4 className="text-sm font-medium text-red-700 mb-1">Error:</h4>
                      <p className="text-sm text-red-600">{result.error}</p>
                    </div>
                  )}
                  {result.response?.ok && (result.response?.data?.saleId || result.response?.saleId) && (
                    <div className="mt-2">
                      <a
                        href={`/s/${result.response.data?.saleId ?? result.response.saleId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Open sale →
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

