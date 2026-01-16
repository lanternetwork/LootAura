'use client'

import AdminTools from '@/components/AdminTools'
import DiagnosticOverlay from '@/components/DiagnosticOverlay'
import DebugToggle from '@/components/debug/DebugToggle'
import ZipLookupTester from '@/components/ZipLookupTester'
import ZipLookupDiagnostics from '@/components/ZipLookupDiagnostics'
import MapDiagnostics from '@/components/MapDiagnostics'
import MapInteractionTester from '@/components/MapInteractionTester'
import MapPinsDiagnostics from '@/components/admin/MapPinsDiagnostics'
import DiagnosticToolsValidator from '@/components/admin/DiagnosticToolsValidator'
import SalesDataTester from '@/components/admin/SalesDataTester'
import TestSalesGenerator from '@/components/admin/TestSalesGenerator'
import SimpleMap from '@/components/location/SimpleMap'
import RateLimitStatus from '@/components/admin/RateLimitStatus'
import LoadTestControls from '@/components/admin/LoadTestControls'
import CloudinaryDiagnostics from '@/components/admin/CloudinaryDiagnostics'
import ImageStatsView from '@/components/admin/ImageStatsView'
import ZipCodeImport from '@/components/admin/ZipCodeImport'
import GeolocationDiagnostics from '@/components/admin/GeolocationDiagnostics'
import DraftSalesDiagnostics from '@/components/admin/DraftSalesDiagnostics'
import AnalyticsDiagnosticsCard from '@/components/admin/AnalyticsDiagnosticsCard'
import OSMAttributionDiagnostics from '@/components/admin/OSMAttributionDiagnostics'
import ItemImagesDiagnostics from '@/components/admin/ItemImagesDiagnostics'
import JobControls from '@/components/admin/JobControls'
import EmailDiagnostics from '@/components/admin/EmailDiagnostics'
import AdminUsersPanel from '@/components/admin/tools/AdminUsersPanel'
import AdminReportsPanel from '@/components/admin/tools/AdminReportsPanel'
import ArchiveControlPanel from '@/components/admin/tools/ArchiveControlPanel'
import TestPromotionTool from '@/components/admin/TestPromotionTool'
import { useState, useRef } from 'react'

export default function AdminToolsPageClient() {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const diagMapRef = useRef<any>(null)

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
          {/* Archive System Control */}
          <ArchiveControlPanel />

          {/* Test Promotion Tool */}
          <TestPromotionTool />

          {/* Moderation Tools */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Moderation Tools</h2>
              <p className="text-sm text-gray-600 mb-4">
                Manage user accounts, review sale reports, and moderate content.
              </p>
            </div>
            <AdminUsersPanel />
            <AdminReportsPanel />
          </div>

          {/* Debug Controls */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Debug Controls</h3>
            {process.env.NEXT_PUBLIC_DEBUG === 'true' ? (
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
            ) : (
              <p className="text-sm text-gray-600">Diagnostics are available in debug mode.</p>
            )}
          </div>

          {/* Geolocation Diagnostics */}
          <GeolocationDiagnostics />

          {/* Draft & Sales Diagnostics */}
          <DraftSalesDiagnostics />

          {/* Cloudinary Diagnostics */}
          <CloudinaryDiagnostics />

          {/* Image Statistics */}
          <ImageStatsView />

          {/* ZIP Code Import */}
          <ZipCodeImport />

          {/* Rate Limiting Status */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Rate Limiting Status</h3>
            <RateLimitStatus />
          </div>

          {/* Background Jobs */}
          <JobControls />

          {/* Email System Diagnostics */}
          <EmailDiagnostics />

          {/* Analytics Diagnostics */}
          <AnalyticsDiagnosticsCard />

          {/* Item Images Diagnostics */}
          <ItemImagesDiagnostics />

          {/* Load Testing Controls */}
          <LoadTestControls />

          {/* Map Smoke Tests */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Map Smoke Tests</h3>
            <div className="space-y-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    // Test Louisville coordinates by opening in new tab
                    const url = '/sales?lat=38.2527&lng=-85.7585&zoom=12'
                    window.open(url, '_blank')
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[SMOKE_TEST] Opening Louisville test:', url)
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Test Louisville
                </button>
                <button
                  onClick={() => {
                    // Test New York coordinates by opening in new tab
                    const url = '/sales?lat=40.7128&lng=-74.0060&zoom=12'
                    window.open(url, '_blank')
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[SMOKE_TEST] Opening New York test:', url)
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Test New York
                </button>
                <button
                  onClick={() => {
                    // Test ZIP search by opening in new tab
                    const url = '/sales?zip=10001'
                    window.open(url, '_blank')
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[SMOKE_TEST] Opening ZIP search test:', url)
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Test ZIP Search (10001)
                </button>
              </div>
              <div className="text-sm text-gray-600">
                <p>• Test Louisville: Opens sales page with Louisville, KY coordinates in new tab</p>
                <p>• Test New York: Opens sales page with New York, NY coordinates in new tab</p>
                <p>• Test ZIP Search: Opens sales page with ZIP lookup for New York ZIP code in new tab</p>
                <p className="mt-2 text-blue-600"><strong>Note:</strong> These tests open in new tabs so you can verify the map loads and functions correctly.</p>
              </div>
            </div>
          </div>

          {/* Sales Data Tester */}
          <SalesDataTester />

          {/* Test Sales Generator */}
          <TestSalesGenerator />

          {/* ZIP Lookup Testing */}
          <ZipLookupTester />

          {/* ZIP Lookup Diagnostics */}
          <ZipLookupDiagnostics />

           {/* Test Map for Diagnostics */}
           <div className="bg-white rounded-lg shadow-md p-6">
             <h3 className="text-lg font-semibold mb-4">Test Map for Diagnostics</h3>
             <p className="text-sm text-gray-600 mb-4">
               This is a miniature version of the same map users see on the main sales page. 
               It uses the exact same rendering system to verify functionality works correctly.
             </p>
             <div
               data-testid="admin-diag-map"
               className="relative w-full h-96 min-h-96"
             >
               <SimpleMap
                 ref={diagMapRef}
                 center={{ lat: 38.2527, lng: -85.7585 }}
                 zoom={10}
                 pins={{
                   sales: [
                     { id: 'test-sale-1', lat: 38.2527, lng: -85.7585 },
                     { id: 'test-sale-2', lat: 38.2627, lng: -85.7685 },
                     { id: 'test-sale-3', lat: 38.2427, lng: -85.7485 },
                     { id: 'test-sale-4', lat: 38.2727, lng: -85.7785 },
                     { id: 'test-sale-5', lat: 38.2327, lng: -85.7385 }
                   ],
                   selectedId: null, // Same as main app - no selected sale by default
                  onPinClick: (id) => {
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[ADMIN_DIAG] Pin clicked:', id)
                    }
                    // Same behavior as main app - just logging for now
                  },
                  onClusterClick: ({ lat, lng, expandToZoom }) => {
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[ADMIN_DIAG] Cluster clicked:', { lat, lng, expandToZoom })
                    }
                    // Same behavior as main app - cluster expansion handled by SimpleMap
                  }
                }}
                onViewportChange={(vp) => {
                  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                    console.log('[ADMIN_DIAG] viewport', vp)
                  }
                }}
               />
             </div>
           </div>

          {/* Map Functionality Diagnostics */}
          <MapDiagnostics mapRef={diagMapRef} />

          {/* Map Interaction Testing */}
          <MapInteractionTester mapRef={diagMapRef} />

          {/* Map Pins Diagnostics */}
          <MapPinsDiagnostics mapRef={diagMapRef} />

          {/* OSM Attribution Diagnostics */}
          <OSMAttributionDiagnostics />

          {/* Diagnostic Tools Validator */}
          <DiagnosticToolsValidator />

          {/* Review Key Lookup */}
          <AdminTools />

          {/* System Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">System Information</h3>
            <div className="space-y-2">
              <p className="text-sm text-gray-700">System status: OK</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Maintenance Mode:</span>
                {process.env.MAINTENANCE_MODE === 'true' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    ON
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    OFF
                  </span>
                )}
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

