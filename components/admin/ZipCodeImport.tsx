'use client'

import { useState } from 'react'

interface ImportStatus {
  status: 'idle' | 'running' | 'completed' | 'error'
  progress?: {
    rowCount: number
    validCount: number
    skippedCount: number
  }
  error?: string
  startTime?: number
  duration?: number
}

const DEFAULT_CSV_PATH = "C:\\Users\\jw831\\Downloads\\zips\\georef-united-states-of-america-zc-point.csv"

export default function ZipCodeImport() {
  const [status, setStatus] = useState<ImportStatus>({ status: 'idle' })
  const [filePath, setFilePath] = useState(DEFAULT_CSV_PATH)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [useFileUpload, setUseFileUpload] = useState(true)

  const startImport = async () => {
    if (isImporting) return

    setIsImporting(true)
    setStatus({
      status: 'running',
      startTime: Date.now(),
      progress: {
        rowCount: 0,
        validCount: 0,
        skippedCount: 0
      }
    })

    try {
      let response: Response

      if (useFileUpload && selectedFile) {
        // Upload file via FormData
        const formData = new FormData()
        formData.append('file', selectedFile)

        response = await fetch('/api/admin/zipcodes/import', {
          method: 'POST',
          body: formData
        })
      } else {
        // Use server-side file path (for local development only)
        response = await fetch('/api/admin/zipcodes/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filePath: filePath
          })
        })
      }

      // Get response text first (can only be read once)
      const responseText = await response.text()
      
      // Handle 413 (Payload Too Large) with helpful message
      if (response.status === 413) {
        throw new Error('File is too large. Vercel has a 4.5 MB request body limit. For large files, please: 1) Use the "Server Path (Local Dev Only)" option if running locally, 2) Split the CSV into smaller files (< 4.5 MB each), or 3) Compress the file before uploading.')
      }

      // Try to parse JSON response, but handle non-JSON errors gracefully
      let data
      try {
        // If response is empty, handle gracefully
        if (!responseText || responseText.trim() === '') {
          throw new Error(`HTTP ${response.status}: ${response.statusText || 'Import failed - empty response'}`)
        }
        
        // Try to parse as JSON
        try {
          data = JSON.parse(responseText)
        } catch (jsonError) {
          // Response is not valid JSON - show first 200 chars of error
          throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 200) || response.statusText || 'Invalid response format'}`)
        }
      } catch (parseError) {
        // If we couldn't parse the response, use the error message
        throw parseError instanceof Error ? parseError : new Error(`HTTP ${response.status}: ${response.statusText || 'Failed to parse response'}`)
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: Import failed`)
      }

      const endTime = Date.now()
      const duration = status.startTime ? endTime - status.startTime : 0

      setStatus(prev => ({
        status: 'completed',
        startTime: prev.startTime,
        progress: {
          rowCount: data.rowCount || 0,
          validCount: data.validCount || 0,
          skippedCount: data.skippedCount || 0
        },
        duration
      }))

    } catch (error) {
      const endTime = Date.now()
      const duration = status.startTime ? endTime - status.startTime : 0
      
      setStatus(prev => ({
        status: 'error',
        startTime: prev.startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      }))
    } finally {
      setIsImporting(false)
    }
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">ZIP Code Import</h3>
      
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={useFileUpload}
              onChange={() => setUseFileUpload(true)}
              disabled={isImporting}
              className="cursor-pointer"
            />
            <span className="text-sm font-medium">Upload File</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!useFileUpload}
              onChange={() => setUseFileUpload(false)}
              disabled={isImporting}
              className="cursor-pointer"
            />
            <span className="text-sm font-medium">Server Path (Local Dev Only)</span>
          </label>
        </div>

        {/* File Upload */}
        {useFileUpload && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={isImporting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {selectedFile && (
              <p className="mt-1 text-xs text-gray-600">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Upload a semicolon-delimited CSV file with ZIP code data.
            </p>
          </div>
        )}

        {/* File Path Input (for local development) */}
        {!useFileUpload && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSV File Path (Server-side)
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              disabled={isImporting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="C:\\path\\to\\georef-united-states-of-america-zc-point.csv"
            />
            <p className="mt-1 text-xs text-gray-500">
              Path must be accessible from the server. Only works in local development.
            </p>
          </div>
        )}

        {/* Import Button */}
        <button
          onClick={startImport}
          disabled={isImporting || (useFileUpload ? !selectedFile : !filePath)}
          className={`px-4 py-2 rounded-md font-medium ${
            isImporting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isImporting ? 'Importing...' : 'Start Import'}
        </button>

        {/* Status Window */}
        {status.status !== 'idle' && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Status:</span>
              <span className={`text-sm font-medium ${
                status.status === 'completed' ? 'text-green-600' :
                status.status === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {status.status === 'running' && '⏳ Running...'}
                {status.status === 'completed' && '✅ Completed'}
                {status.status === 'error' && '❌ Error'}
              </span>
            </div>

            {status.status === 'running' && (
              <div className="text-sm text-gray-600">
                <p>Processing CSV file...</p>
                <p className="mt-2 text-xs">This may take several minutes for large files (~33k rows)</p>
              </div>
            )}

            {status.status === 'completed' && status.progress && (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium text-gray-700">Total Rows:</span>
                    <p className="text-gray-900">{status.progress.rowCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Valid ZIPs:</span>
                    <p className="text-green-600 font-semibold">{status.progress.validCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Skipped:</span>
                    <p className="text-gray-900">{status.progress.skippedCount.toLocaleString()}</p>
                  </div>
                  {status.duration && (
                    <div>
                      <span className="font-medium text-gray-700">Duration:</span>
                      <p className="text-gray-900">{formatDuration(status.duration)}</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600">
                    ✅ Import complete! ZIP codes are now available in the database.
                  </p>
                </div>
              </div>
            )}

            {status.status === 'error' && (
              <div className="text-sm text-red-600">
                <p className="font-medium">Error:</p>
                <p className="mt-1">{status.error}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Check that the file path is correct and accessible from the server.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Help Text */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>• Imports ZIP codes from CSV file into <code className="bg-gray-100 px-1 rounded">lootaura_v2.zipcodes</code> table</p>
          <p>• Uses UPSERT to avoid duplicates (safe to run multiple times)</p>
          <p>• Processes in batches of 1,000 rows</p>
          <p>• Expected file: Semicolon-delimited CSV with columns: Zip Code, Official USPS city name, Official USPS State Code, Geo Point</p>
        </div>
      </div>
    </div>
  )
}

