'use client'
import { useState } from 'react'
import { useSales, useCreateSale } from '@/lib/hooks/useSales'
import { exportToCSV, parseCSV, downloadCSV, CSVRow } from '@/lib/csv'
import { geocodeAddress } from '@/lib/geocode'

export default function CSVImportExport() {
  const { data: sales = [] } = useSales()
  const createSale = useCreateSale()
  const [csvData, setCsvData] = useState('')
  const [parsedData, setParsedData] = useState<CSVRow[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setCsvData(content)
      
      try {
        const parsed = parseCSV(content)
        setParsedData(parsed)
        setError(null)
      } catch (err) {
        setError('Invalid CSV format')
        setParsedData([])
      }
    }
    reader.readAsText(file)
  }

  const handleExport = () => {
    const csv = exportToCSV(sales)
    downloadCSV(csv, 'sales.csv')
  }

  const handleSelectRow = (index: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedRows(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedRows.size === parsedData.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(parsedData.map((_, i) => i)))
    }
  }

  const handleImport = async () => {
    if (selectedRows.size === 0) return

    setImporting(true)
    setError(null)

    try {
      const rowsToImport = parsedData.filter((_, i) => selectedRows.has(i))
      
      for (const row of rowsToImport) {
        try {
          // Try to geocode the address if available
          let lat: number | undefined
          let lng: number | undefined
          
          if (row.address) {
            const geocodeResult = await geocodeAddress(row.address)
            if (geocodeResult) {
              lat = geocodeResult.lat
              lng = geocodeResult.lng
            }
          }

          await createSale.mutateAsync({
            title: row.title,
            description: row.description,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            start_at: row.start_at,
            end_at: row.end_at,
            price_min: row.price_min ? parseFloat(row.price_min) : undefined,
            price_max: row.price_max ? parseFloat(row.price_max) : undefined,
            contact: row.contact,
            lat,
            lng,
            tags: row.tags ? row.tags.split(';') : [],
            photos: [],
            source: row.source || 'csv'
          })
        } catch (err) {
          console.error('Failed to import row:', row.title, err)
        }
      }

      setSelectedRows(new Set())
      alert(`Successfully imported ${rowsToImport.length} sales!`)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import sales')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">CSV Import/Export</h2>
        <p className="text-neutral-600 mb-6">
          Import sales from CSV files or export your current sales to CSV.
        </p>
      </div>

      {/* Export section */}
      <div className="bg-neutral-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Export Sales</h3>
        <p className="text-sm text-neutral-600 mb-4">
          Download all current sales as a CSV file.
        </p>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
        >
          Export {sales.length} Sales to CSV
        </button>
      </div>

      {/* Import section */}
      <div className="bg-neutral-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Import Sales from CSV</h3>
        <p className="text-sm text-neutral-600 mb-4">
          Upload a CSV file with sales data. Expected columns: title, description, address, city, state, zip, start_at, end_at, price_min, price_max, contact, tags, source
        </p>
        
        <div className="space-y-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">
                  Found {parsedData.length} rows
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1 text-sm border rounded hover:bg-neutral-100"
                  >
                    {selectedRows.size === parsedData.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={selectedRows.size === 0 || importing}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? 'Importing...' : `Import ${selectedRows.size} Selected`}
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Select</th>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">Address</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.map((row, index) => (
                      <tr
                        key={index}
                        className={`border-t hover:bg-neutral-50 ${
                          selectedRows.has(index) ? 'bg-amber-50' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(index)}
                            onChange={() => handleSelectRow(index)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{row.title}</td>
                        <td className="px-3 py-2 text-neutral-600">
                          {row.address && (
                            <div>
                              <div>{row.address}</div>
                              {(row.city || row.state) && (
                                <div className="text-xs text-neutral-500">
                                  {row.city}, {row.state}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">
                          {row.start_at && new Date(row.start_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">
                          {row.price_min && row.price_max && (
                            <div>${row.price_min} - ${row.price_max}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
