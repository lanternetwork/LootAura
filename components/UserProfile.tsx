'use client'
import { useState } from 'react'
import { useAuth, useProfile, useUpdateProfile, useSignOut } from '@/lib/hooks/useAuth'
// import { ProfileSchema } from '@/lib/zodSchemas'

export default function UserProfile() {
  const { data: user, isLoading: authLoading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const signOut = useSignOut()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    display_name: profile?.display_name || '',
    avatar_url: profile?.avatar_url || ''
  })
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    try {
      setError(null)
      await updateProfile.mutateAsync(formData)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  const handleCancel = () => {
    setFormData({
      display_name: profile?.display_name || '',
      avatar_url: profile?.avatar_url || ''
    })
    setIsEditing(false)
    setError(null)
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500"></div>
        <span className="text-sm text-neutral-600">Loading...</span>
      </div>
    )
  }

  if (!user) {
    return (
      <a 
        href="/auth/signin" 
        className="btn-accent text-sm"
      >
        Sign In
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white font-medium text-sm">
        {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
      </div>

      {/* User info */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-700 max-w-[140px] truncate hidden lg:inline">
          {profile?.display_name || user.email}
        </span>
        
        {/* Profile dropdown */}
        <div className="relative group">
          <button className="text-neutral-500 hover:text-neutral-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="p-4">
              <h3 className="font-semibold text-neutral-900 mb-3">Profile Settings</h3>
              
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Display Name</label>
                    <input
                      type="text"
                      value={formData.display_name}
                      onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                      placeholder="Your name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Avatar URL</label>
                    <input
                      type="url"
                      value={formData.avatar_url}
                      onChange={e => setFormData({ ...formData, avatar_url: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-red-600">{error}</div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={updateProfile.isPending}
                      className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50"
                    >
                      {updateProfile.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1 bg-neutral-200 text-neutral-700 rounded text-sm hover:bg-neutral-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-neutral-600">Email</div>
                    <div className="text-sm font-medium">{user.email}</div>
                  </div>
                  
                  {profile?.display_name && (
                    <div>
                      <div className="text-sm text-neutral-600">Display Name</div>
                      <div className="text-sm font-medium">{profile.display_name}</div>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full text-left px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100 rounded"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={() => signOut.mutate()}
                      disabled={signOut.isPending}
                      className="w-full text-left px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      {signOut.isPending ? 'Signing out...' : 'Sign Out'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
