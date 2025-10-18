/**
 * Hooks for managing saved search presets
 * Handles both local (signed-out) and cloud (signed-in) storage
 */

import { useState, useEffect, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { AppState } from '@/lib/url/state'

export interface Preset {
  id: string
  name: string
  state: AppState
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const LOCAL_STORAGE_KEY = 'savedPresets'
const SCHEMA_VERSION = 1

interface LocalPreset {
  id: string
  name: string
  state: AppState
  isDefault: boolean
  createdAt: string
  updatedAt: string
  version: number
}

/**
 * Hook for managing presets (local or cloud based on auth state)
 */
export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSignedIn, setIsSignedIn] = useState(false)

  const supabase = createSupabaseBrowserClient()

  // Check auth state
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsSignedIn(!!session)
    }
    checkAuth()
  }, [supabase.auth])

  // Load presets based on auth state
  useEffect(() => {
    const loadPresets = async () => {
      setLoading(true)
      setError(null)

      try {
        if (isSignedIn) {
          await loadCloudPresets()
        } else {
          await loadLocalPresets()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load presets')
      } finally {
        setLoading(false)
      }
    }

    loadPresets()
  }, [isSignedIn])

  const loadLocalPresets = async () => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (!stored) {
        setPresets([])
        return
      }

      const data = JSON.parse(stored)
      if (data.version !== SCHEMA_VERSION) {
        // Clear old data
        localStorage.removeItem(LOCAL_STORAGE_KEY)
        setPresets([])
        return
      }

      setPresets(data.presets || [])
    } catch (err) {
      console.warn('Failed to load local presets:', err)
      setPresets([])
    }
  }

  const loadCloudPresets = async () => {
    const { data, error } = await supabase
      .from('user_presets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to load cloud presets: ${error.message}`)
    }

    const cloudPresets: Preset[] = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      state: row.state_json,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))

    setPresets(cloudPresets)
  }

  const savePreset = useCallback(async (name: string, state: AppState, isDefault = false) => {
    setError(null)

    try {
      if (isSignedIn) {
        await saveCloudPreset(name, state, isDefault)
      } else {
        await saveLocalPreset(name, state, isDefault)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset')
      throw err
    }
  }, [isSignedIn])

  const saveLocalPreset = async (name: string, state: AppState, isDefault = false) => {
    const newPreset: LocalPreset = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      state,
      isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: SCHEMA_VERSION
    }

    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{"presets":[],"version":1}')
    const presets = [...(existing.presets || []), newPreset]

    // If this is default, unset other defaults
    if (isDefault) {
      presets.forEach(p => p.isDefault = false)
      newPreset.isDefault = true
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      presets,
      version: SCHEMA_VERSION
    }))

    setPresets(presets)
  }

  const saveCloudPreset = async (name: string, state: AppState, isDefault = false) => {
    // If this is default, unset other defaults first
    if (isDefault) {
      await supabase
        .from('user_presets')
        .update({ is_default: false })
        .neq('id', '00000000-0000-0000-0000-000000000000') // Update all rows
    }

    const { data, error } = await supabase
      .from('user_presets')
      .insert({
        name,
        state_json: state,
        is_default: isDefault
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to save cloud preset: ${error.message}`)
    }

    const newPreset: Preset = {
      id: data.id,
      name: data.name,
      state: data.state_json,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }

    setPresets(prev => [newPreset, ...prev])
  }

  const deletePreset = useCallback(async (id: string) => {
    setError(null)

    try {
      if (isSignedIn) {
        await deleteCloudPreset(id)
      } else {
        await deleteLocalPreset(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset')
      throw err
    }
  }, [isSignedIn])

  const deleteLocalPreset = async (id: string) => {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{"presets":[],"version":1}')
    const presets = (existing.presets || []).filter((p: LocalPreset) => p.id !== id)

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      presets,
      version: SCHEMA_VERSION
    }))

    setPresets(presets)
  }

  const deleteCloudPreset = async (id: string) => {
    const { error } = await supabase
      .from('user_presets')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete cloud preset: ${error.message}`)
    }

    setPresets(prev => prev.filter(p => p.id !== id))
  }

  const setDefaultPreset = useCallback(async (id: string) => {
    setError(null)

    try {
      if (isSignedIn) {
        await setCloudDefaultPreset(id)
      } else {
        await setLocalDefaultPreset(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default preset')
      throw err
    }
  }, [isSignedIn])

  const setLocalDefaultPreset = async (id: string) => {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{"presets":[],"version":1}')
    const presets = (existing.presets || []).map((p: LocalPreset) => ({
      ...p,
      isDefault: p.id === id
    }))

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      presets,
      version: SCHEMA_VERSION
    }))

    setPresets(presets)
  }

  const setCloudDefaultPreset = async (id: string) => {
    // Unset all defaults first
    await supabase
      .from('user_presets')
      .update({ is_default: false })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    // Set new default
    const { error } = await supabase
      .from('user_presets')
      .update({ is_default: true })
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to set cloud default: ${error.message}`)
    }

    setPresets(prev => prev.map(p => ({
      ...p,
      isDefault: p.id === id
    })))
  }

  return {
    presets,
    loading,
    error,
    isSignedIn,
    savePreset,
    deletePreset,
    setDefaultPreset
  }
}
