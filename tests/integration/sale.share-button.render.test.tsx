/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SaleShareButton from '@/components/share/SaleShareButton'

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackShare: vi.fn(),
  },
}))

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('SaleShareButton', () => {
  const defaultProps = {
    url: 'https://example.com/sales/test-id',
    title: 'Test Sale',
    text: 'Check this out!',
    saleId: 'test-id',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset navigator.share
    delete (window.navigator as any).share
    // Reset navigator.clipboard
    delete (window.navigator as any).clipboard
  })

  it('should render share button', () => {
    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    expect(button).toBeDefined()
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('should open menu when clicked on desktop', async () => {
    const user = userEvent.setup()
    
    // Mock desktop (not mobile)
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    // Mock non-mobile user agent
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Menu should open
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
  })

  it('should show copy link option in menu', async () => {
    const user = userEvent.setup()
    
    // Mock desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    // Mock clipboard API
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: {
        writeText,
      },
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Wait for menu to appear
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    
    // Find copy link option
    const copyLink = screen.getByRole('menuitem', { name: /copy link/i })
    expect(copyLink).toBeDefined()
    
    // Click copy link
    await user.click(copyLink)
    
    // Clipboard should be called
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
  })

  it('should show social share options in menu', async () => {
    const user = userEvent.setup()
    
    // Mock desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Wait for menu to appear
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    
    // Check for social share options
    expect(screen.getByRole('menuitem', { name: /x.*twitter/i })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /facebook/i })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /reddit/i })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: /email/i })).toBeDefined()
  })

  it('should hide mobile-only options on desktop', async () => {
    const user = userEvent.setup()
    
    // Mock desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Wait for menu to appear
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    
    // Mobile-only options should not be visible
    expect(screen.queryByRole('menuitem', { name: /whatsapp/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /sms/i })).toBeNull()
  })

  it('should use Web Share API when available', async () => {
    const user = userEvent.setup()
    
    // Mock Web Share API
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: share,
    })
    
    // Mock mobile user agent
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Web Share API should be called
    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({
        title: defaultProps.title,
        text: defaultProps.text,
        url: defaultProps.url,
      })
    })
  })

  it('should handle Web Share API cancellation gracefully', async () => {
    const user = userEvent.setup()
    
    // Mock Web Share API that rejects with AbortError
    const share = vi.fn().mockRejectedValue(new DOMException('User cancelled', 'AbortError'))
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: share,
    })
    
    // Mock mobile user agent
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Should not log error for AbortError
    await waitFor(() => {
      expect(share).toHaveBeenCalled()
    })
    
    // Should not have logged an error
    expect(consoleSpy).not.toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('should close menu when clicking outside', async () => {
    const user = userEvent.setup()
    
    // Mock desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    render(
      <div>
        <SaleShareButton {...defaultProps} />
        <div data-testid="outside">Outside</div>
      </div>
    )
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Menu should open
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    
    // Click outside
    const outside = screen.getByTestId('outside')
    await user.click(outside)
    
    // Menu should close
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('should close menu on Escape key', async () => {
    const user = userEvent.setup()
    
    // Mock desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })

    render(<SaleShareButton {...defaultProps} />)
    
    const [button] = screen.getAllByRole('button', { name: /share/i })
    await user.click(button)
    
    // Menu should open
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    
    // Press Escape
    await user.keyboard('{Escape}')
    
    // Menu should close
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })
})

