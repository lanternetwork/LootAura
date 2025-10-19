/**
 * Map debugging utilities
 * Controlled by NEXT_PUBLIC_DEBUG environment variable
 */

const isDebugEnabled = () => process.env.NEXT_PUBLIC_DEBUG === 'true'

export const mapDebug = {
  log: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(`[MAP DEBUG] ${message}`, ...args)
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.warn(`[MAP DEBUG] ${message}`, ...args)
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.error(`[MAP DEBUG] ${message}`, ...args)
    }
  },
  
  group: (label: string) => {
    if (isDebugEnabled()) {
      console.group(`[MAP DEBUG] ${label}`)
    }
  },
  
  groupEnd: () => {
    if (isDebugEnabled()) {
      console.groupEnd()
    }
  },
  
  time: (label: string) => {
    if (isDebugEnabled()) {
      console.time(`[MAP DEBUG] ${label}`)
    }
  },
  
  timeEnd: (label: string) => {
    if (isDebugEnabled()) {
      console.timeEnd(`[MAP DEBUG] ${label}`)
    }
  },
  
  // Map-specific debugging
  logMapLoad: (component: string, state: 'start' | 'success' | 'timeout' | 'error', details?: any) => {
    if (isDebugEnabled()) {
      const emoji = {
        start: '🔄',
        success: '✅',
        timeout: '⏰',
        error: '❌'
      }[state]
      
      console.log(`${emoji} [MAP LOAD] ${component}: ${state}`, details || '')
    }
  },
  
  logTokenStatus: (token: string | null | undefined) => {
    if (isDebugEnabled()) {
      const status = token ? '✅ Present' : '❌ Missing'
      const preview = token ? `${token.substring(0, 10)}...` : 'undefined'
      console.log(`🔑 [MAP TOKEN] ${status} (${preview})`)
    }
  },
  
  logMapState: (component: string, state: Record<string, any>) => {
    if (isDebugEnabled()) {
      console.log(`📊 [MAP STATE] ${component}:`, state)
    }
  },
  
  logPerformance: (operation: string, startTime: number) => {
    if (isDebugEnabled()) {
      const duration = Date.now() - startTime
      const status = duration > 1000 ? '🐌 Slow' : duration > 500 ? '⚠️ Medium' : '⚡ Fast'
      console.log(`${status} [MAP PERF] ${operation}: ${duration}ms`)
    }
  }
}

export default mapDebug
