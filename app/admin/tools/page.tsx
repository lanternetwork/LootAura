'use client'

import AdminTools from '@/components/AdminTools'
import DiagnosticOverlay from '@/components/DiagnosticOverlay'
import DebugToggle from '@/components/debug/DebugToggle'
import ZipLookupTester from '@/components/ZipLookupTester'
import ZipLookupDiagnostics from '@/components/ZipLookupDiagnostics'
import MapDiagnostics from '@/components/MapDiagnostics'
import MapInteractionTester from '@/components/MapInteractionTester'
import { useState } from 'react'

export default function AdminToolsPage() {
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Tools</h1>
          <p className="mt-2 text-gray-600">
            Development and debugging tools for LootAura
          </p>
        </div>
        
        <div className="space-y-8">
          {/* Debug Controls */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Debug Controls</h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <DebugToggle />
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
                </button>
              </div>
              <div className="text-sm text-gray-600">
                <p>• Debug Toggle: Enable/disable client-side debugging</p>
                <p>• Diagnostics: View fetch events and system behavior</p>
                <p>• Environment: NEXT_PUBLIC_DEBUG = {process.env.NEXT_PUBLIC_DEBUG || 'false'}</p>
              </div>
            </div>
          </div>

          {/* ZIP Lookup Testing */}
          <ZipLookupTester />

          {/* ZIP Lookup Diagnostics */}
          <ZipLookupDiagnostics />

          {/* Map Functionality Diagnostics */}
          <MapDiagnostics />

          {/* Map Interaction Testing */}
          <MapInteractionTester />

          {/* Review Key Lookup */}
          <AdminTools />

          {/* System Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">System Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Environment:</span>
                <p className="text-gray-900">{process.env.NODE_ENV}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Debug Mode:</span>
                <p className="text-gray-900">{process.env.NEXT_PUBLIC_DEBUG === 'true' ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Clustering:</span>
                <p className="text-gray-900">{process.env.NEXT_PUBLIC_FEATURE_CLUSTERING === 'true' ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Schema:</span>
                <p className="text-gray-900">{process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900">Health Check</h4>
                <p className="text-sm text-gray-600">Check system health status</p>
              </a>
              <a
                href="/api/health/db"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900">Database Health</h4>
                <p className="text-sm text-gray-600">Check database connectivity</p>
              </a>
              <a
                href="/api/health/mapbox"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900">Mapbox Health</h4>
                <p className="text-sm text-gray-600">Check Mapbox integration</p>
              </a>
              <a
                href="/api/health/supabase"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900">Supabase Health</h4>
                <p className="text-sm text-gray-600">Check Supabase connectivity</p>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostic Overlay */}
      {showDiagnostics && (
        <DiagnosticOverlay
          isVisible={showDiagnostics}
          onToggle={() => setShowDiagnostics(false)}
        />
      )}
    </div>
  )
}
