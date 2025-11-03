'use client'

import { useState, useEffect } from 'react'

type AboutCardProps = {
  bio?: string | null
  displayName?: string | null
  locationCity?: string | null
  locationRegion?: string | null
  isEditable?: boolean
  onSave?: (data: { displayName?: string; bio?: string; locationCity?: string; locationRegion?: string }) => Promise<void>
}

export function AboutCard({
  bio,
  displayName,
  locationCity,
  locationRegion,
  isEditable = false,
  onSave,
}: AboutCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editBio, setEditBio] = useState(bio || '')
  const [editDisplayName, setEditDisplayName] = useState(displayName || '')
  const [editCity, setEditCity] = useState(locationCity || '')
  const [editRegion, setEditRegion] = useState(locationRegion || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEditing) {
      setEditBio(bio || '')
      setEditDisplayName(displayName || '')
      setEditCity(locationCity || '')
      setEditRegion(locationRegion || '')
    }
  }, [bio, displayName, locationCity, locationRegion, isEditing])

  const handleSave = async () => {
    if (!onSave) return
    setError(null)
    
    // Validation
    if (editDisplayName.trim().length > 80) {
      setError('Display name must be 80 characters or less')
      return
    }
    if (editBio.length > 250) {
      setError('Bio must be 250 characters or less')
      return
    }
    
    setSaving(true)
    try {
      await onSave({
        displayName: editDisplayName.trim() || undefined,
        bio: editBio.trim() || undefined,
        locationCity: editCity.trim() || undefined,
        locationRegion: editRegion.trim() || undefined,
      })
      setIsEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditBio(bio || '')
    setEditDisplayName(displayName || '')
    setEditCity(locationCity || '')
    setEditRegion(locationRegion || '')
    setIsEditing(false)
    setError(null)
  }

  if (!isEditable && !bio && !displayName && !locationCity && !locationRegion) return null

  return (
    <div className="card">
      <div className="card-body-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="card-title">About</h2>
          {isEditable && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-sm link-accent"
            >
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-4">
            {isEditable && (
              <div>
                <label htmlFor="display-name" className="block text-sm font-medium mb-1">
                  Display Name
                </label>
                <input
                  id="display-name"
                  type="text"
                  className="w-full px-3 py-2 border rounded"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  maxLength={80}
                  placeholder="Your display name"
                />
              </div>
            )}
            <div>
              <label htmlFor="bio" className="block text-sm font-medium mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                className="w-full px-3 py-2 border rounded"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={250}
                rows={4}
                placeholder="Tell us about yourself..."
              />
              <div className="text-xs text-neutral-500 mt-1">{editBio.length}/250</div>
            </div>
            {isEditable && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium mb-1">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    className="w-full px-3 py-2 border rounded"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    maxLength={80}
                    placeholder="City"
                  />
                </div>
                <div>
                  <label htmlFor="region" className="block text-sm font-medium mb-1">
                    Region/State
                  </label>
                  <input
                    id="region"
                    type="text"
                    className="w-full px-3 py-2 border rounded"
                    value={editRegion}
                    onChange={(e) => setEditRegion(e.target.value)}
                    maxLength={80}
                    placeholder="State/Region"
                  />
                </div>
              </div>
            )}
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-accent text-sm"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded px-4 py-2 border text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {displayName && (
              <div>
                <span className="text-sm font-medium text-neutral-700">Display Name: </span>
                <span className="text-neutral-700">{displayName}</span>
              </div>
            )}
            {bio && (
              <div className="text-neutral-700 whitespace-pre-wrap">{bio}</div>
            )}
            {(locationCity || locationRegion) && (
              <div className="text-sm text-neutral-600">
                📍 {locationCity}
                {locationRegion && `, ${locationRegion}`}
              </div>
            )}
            {!bio && !displayName && !locationCity && !locationRegion && (
              <div className="text-neutral-500 italic">No information yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
