'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isNativeApp } from '@/lib/runtime/isNativeApp'
import { MAP_IDLE_FIRST_EVENT } from '@/lib/map/mapIdleEvent'

const CLARITY_DEFER_TIMEOUT_MS = 10000

function injectClarity(clarityId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if ((window as any).clarity || document.querySelector(`script[data-clarity-id="${clarityId}"]`)) return
  const c = window as any
  const l = document
  const a = 'clarity'
  const r = 'script'
  const i = clarityId
  c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) }
  const t = l.createElement(r) as HTMLScriptElement
  t.async = true
  t.src = 'https://www.clarity.ms/tag/' + i
  const y = l.getElementsByTagName(r)[0]
  if (y?.parentNode) {
    y.parentNode.insertBefore(t, y)
  } else {
    ;(l.head || l.body).appendChild(t)
  }
  const script = document.querySelector(`script[src*="clarity.ms/tag/${clarityId}"]`)
  if (script) script.setAttribute('data-clarity-id', clarityId)
}

/**
 * Microsoft Clarity analytics integration.
 * On in-app /sales, injection is deferred until after map_idle to reduce startup contention.
 */
export default function ClarityClient() {
  const pathname = usePathname() ?? ''

  useEffect(() => {
    if (typeof window === 'undefined') return
    const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!clarityId || clarityId.trim() === '') return
    if ((window as any).clarity || document.querySelector(`script[data-clarity-id="${clarityId}"]`)) return

    const deferOnInAppSales = pathname === '/sales' && isNativeApp()

    if (!deferOnInAppSales) {
      injectClarity(clarityId)
      return
    }

    const onMapIdle = () => {
      injectClarity(clarityId)
      window.removeEventListener(MAP_IDLE_FIRST_EVENT, onMapIdle)
      clearTimeout(timeoutId)
    }
    window.addEventListener(MAP_IDLE_FIRST_EVENT, onMapIdle)
    const timeoutId = setTimeout(() => {
      window.removeEventListener(MAP_IDLE_FIRST_EVENT, onMapIdle)
      injectClarity(clarityId)
    }, CLARITY_DEFER_TIMEOUT_MS)

    return () => {
      window.removeEventListener(MAP_IDLE_FIRST_EVENT, onMapIdle)
      clearTimeout(timeoutId)
    }
  }, [pathname])

  return null
}

