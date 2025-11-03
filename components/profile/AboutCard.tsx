'use client'

import { useState } from 'react'

type AboutCardProps = {
  bio?: string | null
  isEditable?: boolean
  onSave?: (bio: string) => Promise<void>
}

export function AboutCard({ bio, isEditable = false, onSave }: AboutCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editBio, setEditBio] = useState(bio || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!onSave) return
    setError(null)
    setSaving(true)
    try {
      await onSave(editBio)
      setIsEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditBio(bio || '')
    setIsEditing(false)
    setError(null)
  }

  if (!isEditable && !bio) return null

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
          <div className="space-y-3">
            <textarea
              className="w-full px-3 py-2 border rounded"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Tell us about yourself..."
            />
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
          <div className="text-neutral-700 whitespace-pre-wrap">{bio || 'No bio yet.'}</div>
        )}
      </div>
    </div>
  )
}

