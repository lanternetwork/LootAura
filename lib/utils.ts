import { type ClassValue, clsx } from 'clsx'

/**
 * Utility function to merge classNames, compatible with shadcn/ui
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

