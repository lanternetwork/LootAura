'use client'

import React from 'react'
import CSVImportExport from './CSVImportExport'

export default function ImportSales() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Import Sales</h2>
        <p className="text-neutral-600 mb-6">
          Import sales from CSV files.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b">
        <button
          className="px-4 py-2 font-medium border-b-2 border-amber-500 text-amber-600"
        >
          CSV Import/Export
        </button>
      </div>

      <CSVImportExport />
    </div>
  )
}