'use client'

import { useEffect, useRef } from 'react'
import { canStartUserLocationWatch, startUserLocationWatch, type UserLocationWatchUpdate } from '@/lib/map/userLocationWatch'

export type UseUserLocationWatchOptions = {
  /** Start watch only when GPS permission is granted. */
  enabled: boolean
  onUpdate: (update: UserLocationWatchUpdate) => void
  /** Permission revoked or watch error (e.g. PERMISSION_DENIED). */
  onPermissionLost?: () => void
}

/**
 * One watchPosition per enabled session. Clears watch on unmount or when disabled.
 * Watch ticks must only update position state — no recenter, cookie, or fetch side effects.
 */
export function useUserLocationWatch(options: UseUserLocationWatchOptions): void {
  const handleRef = useRef<ReturnType<typeof startUserLocationWatch> | null>(null)
  const onUpdateRef = useRef(options.onUpdate)
  const onPermissionLostRef = useRef(options.onPermissionLost)

  onUpdateRef.current = options.onUpdate
  onPermissionLostRef.current = options.onPermissionLost

  useEffect(() => {
    if (!options.enabled || !canStartUserLocationWatch()) {
      if (handleRef.current) {
        handleRef.current.stop()
        handleRef.current = null
      }
      return
    }

    if (handleRef.current) {
      return
    }

    const handle = startUserLocationWatch({
      onUpdate: (update) => onUpdateRef.current(update),
      onError: (code) => {
        if (code === 1) {
          handleRef.current?.stop()
          handleRef.current = null
          onPermissionLostRef.current?.()
        }
      },
    })

    if (!handle) {
      return
    }

    handleRef.current = handle

    return () => {
      handleRef.current?.stop()
      handleRef.current = null
    }
  }, [options.enabled])
}
