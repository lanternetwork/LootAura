'use client'

import { useState, useEffect } from 'react'

interface EmailConfiguration {
  emailsEnabled: boolean
  resendApiKeyPresent: boolean
  resendFromEmail: string | null
  emailFrom: string | null
  cronSecretPresent: boolean
  siteUrl: string | null
}

interface EmailFeatureFlags {
  favoriteSaleStartingSoonEnabled: boolean
  favoriteSaleStartingSoonHoursBeforeStart: number
  sellerWeeklyAnalyticsEnabled: boolean
}

interface EmailEnvironment {
  nodeEnv: string
  isProduction: boolean
}

interface EmailDiagnosticsData {
  configuration: EmailConfiguration
  featureFlags: EmailFeatureFlags
  environment: EmailEnvironment
}

interface TestEmailResult {
  ok: boolean
  message?: string
  error?: string
}

export default function EmailDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<EmailDiagnosticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testEmailLoading, setTestEmailLoading] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<TestEmailResult | null>(null)
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [testEmailType, setTestEmailType] = useState<'sale_created' | 'favorites_digest' | 'seller_weekly'>('sale_created')

  useEffect(() => {
    fetchDiagnostics()
  }, [])

  const fetchDiagnostics = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/email/diagnostics')
      if (!response.ok) {
        throw new Error(`Failed to fetch diagnostics: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.ok && data.diagnostics) {
        setDiagnostics(data.diagnostics)
      } else {
        throw new Error(data.error || 'Failed to fetch diagnostics')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const sendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      setTestEmailResult({ ok: false, error: 'Please enter a valid email address' })
      return
    }

    setTestEmailLoading(true)
    setTestEmailResult(null)

    try {
      const response = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to: testEmailAddress,
          emailType: testEmailType,
        }),
      })

      const data = await response.json()
      setTestEmailResult(data)
    } catch (err) {
      setTestEmailResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setTestEmailLoading(false)
    }
  }

  const getStatusBadge = (condition: boolean) => {
    return condition ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        ✓ Configured
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        ✗ Missing
      </span>
    )
  }

  const getFeatureBadge = (enabled: boolean) => {
    return enabled ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Enabled
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        Disabled
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Email System Diagnostics</h3>
        <p className="text-sm text-gray-600">Loading diagnostics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Email System Diagnostics</h3>
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Error: {error}
        </div>
        <button
          onClick={fetchDiagnostics}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!diagnostics) {
    return null
  }

  const { configuration, featureFlags, environment } = diagnostics

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Email System Diagnostics</h3>
        <button
          onClick={fetchDiagnostics}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-6">
        {/* Configuration Status */}
        <div>
          <h4 className="text-md font-semibold mb-3">Configuration</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Emails Enabled:</span>
              {getStatusBadge(configuration.emailsEnabled)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Resend API Key:</span>
              {getStatusBadge(configuration.resendApiKeyPresent)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Resend From Email:</span>
              <span className="text-gray-600">
                {configuration.resendFromEmail || configuration.emailFrom || 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">CRON Secret:</span>
              {getStatusBadge(configuration.cronSecretPresent)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Site URL:</span>
              <span className="text-gray-600">{configuration.siteUrl || 'Not set'}</span>
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div>
          <h4 className="text-md font-semibold mb-3">Feature Flags</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Favorite Sale Starting Soon:</span>
              {getFeatureBadge(featureFlags.favoriteSaleStartingSoonEnabled)}
            </div>
            {featureFlags.favoriteSaleStartingSoonEnabled && (
              <div className="ml-4 text-xs text-gray-600">
                Hours before start: {featureFlags.favoriteSaleStartingSoonHoursBeforeStart}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Seller Weekly Analytics:</span>
              {getFeatureBadge(featureFlags.sellerWeeklyAnalyticsEnabled)}
            </div>
          </div>
        </div>

        {/* Environment */}
        <div>
          <h4 className="text-md font-semibold mb-3">Environment</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Node Environment:</span>
              <span className="text-gray-600">{environment.nodeEnv}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Production Mode:</span>
              {environment.isProduction ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  Production
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Development
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Test Email */}
        <div className="border-t pt-4">
          <h4 className="text-md font-semibold mb-3">Test Email</h4>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={testEmailType}
                onChange={(e) => setTestEmailType(e.target.value as 'sale_created' | 'favorites_digest' | 'seller_weekly')}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="sale_created">Sale Created Confirmation</option>
                <option value="favorites_digest">Favorites Starting Soon Digest</option>
                <option value="seller_weekly">Seller Weekly Analytics</option>
              </select>
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="test@example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendTestEmail}
                disabled={testEmailLoading || !testEmailAddress}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {testEmailLoading ? 'Sending...' : 'Send Test'}
              </button>
            </div>
            {testEmailResult && (
              <div
                className={`p-3 rounded text-sm ${
                  testEmailResult.ok
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {testEmailResult.ok ? (
                  <p>✓ {testEmailResult.message || 'Test email sent successfully'}</p>
                ) : (
                  <p>✗ {testEmailResult.error || 'Failed to send test email'}</p>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500">
              Sends a test email of the selected type to verify email configuration and templates.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t pt-4">
          <h4 className="text-md font-semibold mb-3">Quick Actions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <a
              href="/api/cron/daily"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <h5 className="font-medium text-gray-900">Daily Cron</h5>
              <p className="text-xs text-gray-600">Includes favorite sales emails</p>
            </a>
            <a
              href="/api/cron/seller-weekly-analytics"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <h5 className="font-medium text-gray-900">Analytics Cron</h5>
              <p className="text-xs text-gray-600">Test cron endpoint</p>
            </a>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Note: Cron endpoints require Bearer token authentication. Use these links for reference only.
          </p>
        </div>
      </div>
    </div>
  )
}

