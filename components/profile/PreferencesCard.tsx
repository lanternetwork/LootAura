'use client'

import { useState } from 'react'

type PreferencesCardProps = {
  theme?: string
  units?: string
  onSave?: (theme: string, units: string) => Promise<void>
}

export function PreferencesCard({ theme = 'system', units = 'imperial', onSave }: PreferencesCardProps) {
  const [editTheme, setEditTheme] = useState(theme)
  const [editUnits, setEditUnits] = useState(units)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!onSave) return
    setError(null)
    setSaving(true)
    try {
      await onSave(editTheme, editUnits)
    } catch (e: any) {
      setError(e?.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

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
          <div className="text-sm text-neutral-600">
            Location from session; default search radius 25 miles.
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (editTheme === theme && editUnits === units)}
              className="btn-accent"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

