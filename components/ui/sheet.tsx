'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

const Sheet = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(({ className, open, onOpenChange, children, ...props }, ref) => {
  const [internalOpen, setInternalOpen] = React.useState(open || false)
  
  const isOpen = open !== undefined ? open : internalOpen
  
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
  }
  
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <div
      ref={ref}
      className={cn('fixed inset-0 z-50', className)}
      {...props}
    >
      <div className="fixed inset-0 bg-black/50" onClick={() => handleOpenChange(false)} />
      <div className="fixed inset-0 flex items-end justify-center p-4">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, {
              ...child.props,
              onClose: () => handleOpenChange(false)
            })
          }
          return child
        })}
      </div>
    </div>
  )
})
Sheet.displayName = 'Sheet'

const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn('', className)}
    {...props}
  >
    {children}
  </button>
))
SheetTrigger.displayName = 'SheetTrigger'

const SheetContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    onClose?: () => void
  }
>(({ className, side = 'bottom', onClose, children, ...props }, ref) => {
  const sideClasses = {
    top: 'slide-in-from-top',
    right: 'slide-in-from-right',
    bottom: 'slide-in-from-bottom',
    left: 'slide-in-from-left'
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        'relative bg-white rounded-t-lg shadow-lg max-h-[80vh] w-full max-w-md mx-auto',
        sideClasses[side],
        className
      )}
      {...props}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  )
})
SheetContent.displayName = 'SheetContent'

const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-6 py-4 border-b', className)}
    {...props}
  />
))
SheetHeader.displayName = 'SheetHeader'

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle }
