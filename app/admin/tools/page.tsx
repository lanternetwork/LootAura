'use client'

import AdminTools from '@/components/AdminTools'
import DiagnosticOverlay from '@/components/DiagnosticOverlay'
import DebugToggle from '@/components/debug/DebugToggle'
import ZipLookupTester from '@/components/ZipLookupTester'
import ZipLookupDiagnostics from '@/components/ZipLookupDiagnostics'
import MapDiagnostics from '@/components/MapDiagnostics'
import MapInteractionTester from '@/components/MapInteractionTester'
import SalesMap from '@/components/location/SalesMap'
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

          {/* Map Smoke Tests */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Map Smoke Tests</h3>
            <div className="space-y-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    // Navigate to sales page with Louisville coordinates
                    window.location.href = '/sales?lat=38.2527&lng=-85.7585&zoom=12'
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Set Louisville
                </button>
                <button
                  onClick={() => {
                    // Navigate to sales page with New York coordinates
                    window.location.href = '/sales?lat=40.7128&lng=-74.0060&zoom=12'
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Set New York
                </button>
                <button
                  onClick={() => {
                    // Navigate to sales page with ZIP search
                    window.location.href = '/sales?zip=10001'
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Test ZIP Search (10001)
                </button>
              </div>
              <div className="text-sm text-gray-600">
                <p>• Set Louisville: Navigate to Louisville, KY with proper coordinates</p>
                <p>• Set New York: Navigate to New York, NY with proper coordinates</p>
                <p>• Test ZIP Search: Trigger ZIP lookup for New York ZIP code</p>
              </div>
            </div>
          </div>

          {/* ZIP Lookup Testing */}
          <ZipLookupTester />

          {/* ZIP Lookup Diagnostics */}
          <ZipLookupDiagnostics />

           {/* Test Map for Diagnostics */}
           <div className="bg-white rounded-lg shadow-md p-6">
             <h3 className="text-lg font-semibold mb-4">Test Map for Diagnostics</h3>
             <p className="text-sm text-gray-600 mb-4">
               This map is used by the diagnostic tools below to test map functionality.
             </p>
             <div
               data-testid="map-container"
               className="w-full h-96 bg-gray-100 rounded-lg overflow-hidden relative"
             >
               <SalesMap
                 sales={[]}
                 markers={[]}
                 center={{ lat: 38.2527, lng: -85.7585 }}
                 zoom={10}
                 onViewChange={() => {}}
                 onMoveEnd={() => {}}
               />
               {/* Debug info overlay */}
               <div className="absolute top-2 left-2 z-50 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
                 <div>Container: {typeof window !== 'undefined' ? document.querySelector('[data-testid="map-container"]')?.getBoundingClientRect().width : 'N/A'}×{typeof window !== 'undefined' ? document.querySelector('[data-testid="map-container"]')?.getBoundingClientRect().height : 'N/A'}</div>
                 <div>Map Element: {typeof window !== 'undefined' ? document.querySelector('.mapboxgl-map') ? 'Found' : 'Not Found' : 'N/A'}</div>
                 <div>Map Instance: {typeof window !== 'undefined' ? (() => {
                   const mapElement = document.querySelector('.mapboxgl-map')
                   if (!mapElement) return 'No Element'
                   const instance = (mapElement as any)._mapboxgl_map || 
                                   (mapElement as any).__mapboxgl_map ||
                                   (mapElement as any).getMap?.() ||
                                   (mapElement as any).__mapboxgl_map
                   return instance ? 'Available' : 'Not Available'
                 })() : 'N/A'}</div>
                 <div>Map Methods: {typeof window !== 'undefined' ? (() => {
                   const mapElement = document.querySelector('.mapboxgl-map')
                   if (!mapElement) return 'No Element'
                   const instance = (mapElement as any)._mapboxgl_map || 
                                   (mapElement as any).__mapboxgl_map ||
                                   (mapElement as any).getMap?.() ||
                                   (mapElement as any).__mapboxgl_map
                   return instance ? Object.getOwnPropertyNames(instance).slice(0, 5).join(', ') : 'No Instance'
                 })() : 'N/A'}</div>
               </div>
             </div>
           </div>

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
