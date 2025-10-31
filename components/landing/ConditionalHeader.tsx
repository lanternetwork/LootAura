'use client'
import { usePathname } from 'next/navigation'
import { Header } from '@/app/Header'

export function ConditionalHeader() {
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  
  // Hide old header on landing page (has TopNav instead)
  if (isLandingPage) {
    return null
  }
  
  return <Header />
}

