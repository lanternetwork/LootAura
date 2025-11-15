import { useEffect, useRef, useState } from 'react'

export function useHasOverflow<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const checkOverflow = () => {
      const hasVerticalOverflow = element.scrollHeight > element.clientHeight
      setHasOverflow(hasVerticalOverflow)
    }

    // Initial check
    checkOverflow()

    // Watch for changes
    const resizeObserver = new ResizeObserver(checkOverflow)
    resizeObserver.observe(element)

    // Also check when content changes
    const mutationObserver = new MutationObserver(checkOverflow)
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
    })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  return { ref, hasOverflow }
}

