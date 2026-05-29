'use client'

import { Suspense } from 'react'
import { CompleteAuthFromFragment } from '@/components/auth/CompleteAuthFromFragment'

function AuthCallbackFinishInner() {
  return <CompleteAuthFromFragment defaultRedirect="/sales" />
}

export default function AuthCallbackFinishPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-neutral-50">
          <p className="text-gray-600">Completing sign-in…</p>
        </div>
      }
    >
      <AuthCallbackFinishInner />
    </Suspense>
  )
}
