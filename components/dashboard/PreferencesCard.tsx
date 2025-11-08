'use client'

import { useState } from 'react'
import type { UserPreferences } from '@/lib/data/profileAccess'

interface PreferencesCardProps {
  preferences: UserPreferences
  onSave?: (preferences: UserPreferences) => Promise<void>
}

export function PreferencesCard({ preferences, onSave }: PreferencesCardProps) {
  const [editTheme, setEditTheme] = useState(preferences.theme || 'system')
  const [editUnits, setEditUnits] = useState(preferences.units || 'imperial')
  const [editRadius, setEditRadius] = useState(preferences.default_radius_km ?? 10)
  const [editEmailOptIn, setEditEmailOptIn] = useState(preferences.email_opt_in ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!onSave) return
    setError(null)
    setSaving(true)
    try {
      await onSave({
        theme: editTheme,
        units: editUnits,
        default_radius_km: editRadius,
        email_opt_in: editEmailOptIn,
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    editTheme !== (preferences.theme || 'system') ||
    editUnits !== (preferences.units || 'imperial') ||
    editRadius !== (preferences.default_radius_km ?? 10) ||
    editEmailOptIn !== (preferences.email_opt_in ?? false)

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value="system"
                  checked={editTheme === 'system'}
                  onChange={(e) => setEditTheme(e.target.value)}
                  className="text-accent-primary"
                />
                <span className="text-sm">System</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={editTheme === 'light'}
                  onChange={(e) => setEditTheme(e.target.value)}
                  className="text-accent-primary"
                />
                <span className="text-sm">Light</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={editTheme === 'dark'}
                  onChange={(e) => setEditTheme(e.target.value)}
                  className="text-accent-primary"
                />
                <span className="text-sm">Dark</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Units</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="units"
                  value="imperial"
                  checked={editUnits === 'imperial'}
                  onChange={(e) => setEditUnits(e.target.value)}
                  className="text-accent-primary"
                />
                <span className="text-sm">Imperial</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="units"
                  value="metric"
                  checked={editUnits === 'metric'}
                  onChange={(e) => setEditUnits(e.target.value)}
                  className="text-accent-primary"
                />
                <span className="text-sm">Metric</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Default search radius (km)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={editRadius}
              onChange={(e) => setEditRadius(Number(e.target.value))}
              className="w-40 px-3 py-2 border rounded"
            />
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={editEmailOptIn}
              onChange={(e) => setEditEmailOptIn(e.target.checked)}
            />
            <span>Email me occasional tips and updates</span>
          </label>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="btn-accent"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditTheme(preferences.theme || 'system')
                setEditUnits(preferences.units || 'imperial')
                setEditRadius(preferences.default_radius_km ?? 10)
                setEditEmailOptIn(preferences.email_opt_in ?? false)
              }}
              className="rounded px-4 py-2 border text-sm"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

