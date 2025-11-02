'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface MobileFilterContextType {
  isOpen: boolean
  openFilterSheet: () => void
  closeFilterSheet: () => void
}

const MobileFilterContext = createContext<MobileFilterContextType | undefined>(undefined)

export function MobileFilterProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openFilterSheet = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeFilterSheet = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <MobileFilterContext.Provider value={{ isOpen, openFilterSheet, closeFilterSheet }}>
      {children}
    </MobileFilterContext.Provider>
  )
}

export function useMobileFilter() {
  const context = useContext(MobileFilterContext)
  if (context === undefined) {
    // Return default values if not in provider (for Header component)
    return {
      isOpen: false,
      openFilterSheet: () => {},
      closeFilterSheet: () => {}
    }
  }
  return context
}

