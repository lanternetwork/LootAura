'use client'
import { Header } from '@/app/Header'

export function ConditionalHeader() {
  // Show Header on all pages including landing page
  // The landing page now uses Header instead of TopNav for consistent auth state
  return <Header />
}

