'use client'

import React from 'react'

export default function CopyButton({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={className || 'rounded border px-2 py-1 text-xs'}
      onClick={() => navigator.clipboard.writeText(text)}
    >
      {children}
    </button>
  )
}


