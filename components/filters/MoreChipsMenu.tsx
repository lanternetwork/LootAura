'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

type MoreChipsMenuProps = {
  count: number
  items: Array<{ id: string; label: string }>
  selectedCategories: string[]
  onToggle: (categoryId: string) => void
}

export default function MoreChipsMenu({ count, items, selectedCategories, onToggle }: MoreChipsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-sm border border-gray-300 bg-white hover:bg-gray-50 rounded-full"
        data-role="more-button"
      >
        More ({count})
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]"
        >
          <div className="p-2 space-y-1">
            {items.map((item) => {
              const isSelected = selectedCategories.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onToggle(item.id)
                    // Keep menu open for multiple selections
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-sm rounded-md transition-colors
                    ${isSelected 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'hover:bg-gray-100 text-gray-700'
                    }
                  `}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
