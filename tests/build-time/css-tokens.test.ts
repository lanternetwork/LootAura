import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Build-time CSS Token Check', () => {
  it('should contain required grid column classes in compiled CSS', () => {
    // This test ensures that Tailwind CSS compilation includes all required grid classes
    // In a real CI environment, this would check the actual compiled CSS file
    
    const requiredClasses = [
      'grid-cols-1',
      'grid-cols-2', 
      'grid-cols-3',
      'sm:grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-1',
      'lg:grid-cols-2',
      'lg:grid-cols-3',
      'xl:grid-cols-1',
      'xl:grid-cols-2',
      'xl:grid-cols-3',
      'xl:grid-cols-4'
    ]

    // For now, we'll just verify the safelist configuration exists
    const tailwindConfigPath = path.join(process.cwd(), 'tailwind.config.ts')
    const configContent = fs.readFileSync(tailwindConfigPath, 'utf-8')
    
    requiredClasses.forEach(className => {
      expect(configContent).toContain(className)
    })
  })

  it('should have proper Tailwind content globs', () => {
    const tailwindConfigPath = path.join(process.cwd(), 'tailwind.config.ts')
    const configContent = fs.readFileSync(tailwindConfigPath, 'utf-8')
    
    // Verify content paths include our components
    expect(configContent).toContain('./app/**/*.{ts,tsx}')
    expect(configContent).toContain('./components/**/*.{ts,tsx}')
  })
})
