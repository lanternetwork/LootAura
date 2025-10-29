import { type ClassValue, clsx } from 'clsx'

/**
 * Utility function to merge Tailwind CSS classes
 * Uses clsx for conditional classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
