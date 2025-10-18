/**
 * Preset Menu Component
 * Lazy-loaded UI for managing saved search presets
 */

import React, { useState, useCallback } from 'react'
import { usePresets } from '@/lib/hooks/usePresets'
import { AppState } from '@/lib/url/state'
import { isSavedPresetsEnabled } from '@/lib/flags'

interface PresetMenuProps {
  currentState: AppState
  onApplyPreset: (state: AppState) => void
  className?: string
}

export default function PresetMenu({ currentState, onApplyPreset, className = '' }: PresetMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { 
    presets, 
    loading, 
    error, 
    isSignedIn, 
    savePreset, 
    deletePreset, 
    setDefaultPreset 
  } = usePresets()

  // Don't render if feature is disabled
  if (!isSavedPresetsEnabled()) {
    return null
  }

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return

    setIsSaving(true)
    try {
      await savePreset(presetName.trim(), currentState)
      setShowSaveDialog(false)
      setPresetName('')
    } catch (err) {
      console.error('Failed to save preset:', err)
    } finally {
      setIsSaving(false)
    }
  }, [presetName, currentState, savePreset])

  const handleApplyPreset = useCallback((preset: any) => {
    onApplyPreset(preset.state)
    setIsOpen(false)
  }, [onApplyPreset])

  const handleDeletePreset = useCallback(async (id: string) => {
    if (confirm('Are you sure you want to delete this preset?')) {
      try {
        await deletePreset(id)
      } catch (err) {
        console.error('Failed to delete preset:', err)
      }
    }
  }, [deletePreset])

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await setDefaultPreset(id)
    } catch (err) {
      console.error('Failed to set default preset:', err)
    }
  }, [setDefaultPreset])

  return (
    <div className={`relative ${className}`}>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span>Presets</span>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-50">
          <div className="p-2">
            {/* Save Current */}
            <button
              onClick={() => setShowSaveDialog(true)}
              className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 rounded"
            >
              💾 Save current search
            </button>

            {/* Presets List */}
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading presets...</div>
            ) : error ? (
              <div className="px-3 py-2 text-sm text-red-500">{error}</div>
            ) : presets.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No saved presets</div>
            ) : (
              <div className="space-y-1">
                {presets.map((preset) => (
                  <div key={preset.id} className="group">
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded">
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        className="flex-1 text-left text-sm"
                      >
                        {preset.isDefault && '⭐ '}
                        {preset.name}
                      </button>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!preset.isDefault && (
                          <button
                            onClick={() => handleSetDefault(preset.id)}
                            className="p-1 text-xs text-gray-500 hover:text-yellow-600"
                            title="Set as default"
                          >
                            ⭐
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePreset(preset.id)}
                          className="p-1 text-xs text-gray-500 hover:text-red-600"
                          title="Delete preset"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Auth Status */}
            <div className="px-3 py-2 text-xs text-gray-500 border-t mt-2 pt-2">
              {isSignedIn ? '☁️ Cloud storage' : '💾 Local storage'}
            </div>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">Save Search Preset</h3>
            
            <div className="mb-4">
              <label htmlFor="preset-name" className="block text-sm font-medium text-gray-700 mb-2">
                Preset Name
              </label>
              <input
                id="preset-name"
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter preset name..."
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveDialog(false)
                  setPresetName('')
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetName.trim() || isSaving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
