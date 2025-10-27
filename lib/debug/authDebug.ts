/**
 * Authentication debugging utilities
 * Controlled by NEXT_PUBLIC_DEBUG environment variable
 */

const isDebugEnabled = () => process.env.NEXT_PUBLIC_DEBUG === 'true'

export const authDebug = {
  log: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(`[AUTH DEBUG] ${message}`, ...args)
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.warn(`[AUTH DEBUG] ${message}`, ...args)
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.error(`[AUTH DEBUG] ${message}`, ...args)
    }
  },
  
  group: (label: string) => {
    if (isDebugEnabled()) {
      console.group(`[AUTH DEBUG] ${label}`)
    }
  },
  
  groupEnd: () => {
    if (isDebugEnabled()) {
      console.groupEnd()
    }
  },
  
  time: (label: string) => {
    if (isDebugEnabled()) {
      console.time(`[AUTH DEBUG] ${label}`)
    }
  },
  
  timeEnd: (label: string) => {
    if (isDebugEnabled()) {
      console.timeEnd(`[AUTH DEBUG] ${label}`)
    }
  },

  // Auth-specific debugging
  logAuthFlow: (flow: string, step: string, status: 'start' | 'success' | 'error', details?: any) => {
    if (isDebugEnabled()) {
      const emoji = {
        start: '🔄',
        success: '✅',
        error: '❌'
      }[status]
      
      console.log(`${emoji} [AUTH FLOW] ${flow} → ${step}: ${status}`, details || '')
    }
  },

  logSessionState: (session: any) => {
    if (isDebugEnabled()) {
      const hasSession = !!session
      const userId = session?.user?.id || 'none'
      const email = session?.user?.email || 'none'
      const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none'
      
      console.log(`🔐 [AUTH SESSION]`, {
        hasSession,
        userId: userId.substring(0, 8) + '...',
        email: email.substring(0, 3) + '***@' + email.split('@')[1] || 'none',
        expiresAt,
        isValid: session?.expires_at > Date.now() / 1000
      })
    }
  },

  logProfileState: (profile: any) => {
    if (isDebugEnabled()) {
      const hasProfile = !!profile
      const profileId = profile?.id || 'none'
      const displayName = profile?.display_name || 'none'
      const homeZip = profile?.home_zip || 'none'
      
      console.log(`👤 [AUTH PROFILE]`, {
        hasProfile,
        profileId: profileId.substring(0, 8) + '...',
        displayName,
        homeZip,
        preferences: profile?.preferences || {}
      })
    }
  },

  logAuthError: (operation: string, error: any) => {
    if (isDebugEnabled()) {
      console.error(`❌ [AUTH ERROR] ${operation}:`, {
        message: error?.message || 'Unknown error',
        code: error?.code || 'no-code',
        status: error?.status || 'no-status',
        stack: error?.stack?.split('\n')[0] || 'no-stack'
      })
    }
  },

  logRateLimit: (endpoint: string, allowed: boolean, reason?: string) => {
    if (isDebugEnabled()) {
      const emoji = allowed ? '✅' : '🚫'
      console.log(`${emoji} [AUTH RATE LIMIT] ${endpoint}: ${allowed ? 'allowed' : 'blocked'}`, reason || '')
    }
  },

  logOAuthFlow: (provider: string, step: string, details?: any) => {
    if (isDebugEnabled()) {
      console.log(`🔗 [AUTH OAUTH] ${provider} → ${step}`, details || '')
    }
  },

  logMagicLink: (email: string, status: 'sent' | 'used' | 'expired' | 'error', details?: any) => {
    if (isDebugEnabled()) {
      const emoji = {
        sent: '📧',
        used: '✅',
        expired: '⏰',
        error: '❌'
      }[status]
      
      const maskedEmail = email.substring(0, 3) + '***@' + email.split('@')[1]
      console.log(`${emoji} [AUTH MAGIC LINK] ${maskedEmail}: ${status}`, details || '')
    }
  },

  logPasswordReset: (email: string, status: 'requested' | 'completed' | 'error', details?: any) => {
    if (isDebugEnabled()) {
      const emoji = {
        requested: '🔒',
        completed: '✅',
        error: '❌'
      }[status]
      
      const maskedEmail = email.substring(0, 3) + '***@' + email.split('@')[1]
      console.log(`${emoji} [AUTH PASSWORD RESET] ${maskedEmail}: ${status}`, details || '')
    }
  },

  logMiddleware: (path: string, action: string, details?: any) => {
    if (isDebugEnabled()) {
      console.log(`🛡️ [AUTH MIDDLEWARE] ${path} → ${action}`, details || '')
    }
  },

  logPerformance: (operation: string, startTime: number) => {
    if (isDebugEnabled()) {
      const duration = Date.now() - startTime
      const status = duration > 1000 ? '🐌 Slow' : duration > 500 ? '⚠️ Medium' : '⚡ Fast'
      console.log(`${status} [AUTH PERF] ${operation}: ${duration}ms`)
    }
  },

  // Security-focused debugging (be careful with sensitive data)
  logSecurityEvent: (event: string, details?: any) => {
    if (isDebugEnabled()) {
      console.warn(`🔒 [AUTH SECURITY] ${event}`, {
        timestamp: new Date().toISOString(),
        ...details
      })
    }
  },

  logValidationError: (field: string, error: string) => {
    if (isDebugEnabled()) {
      console.warn(`⚠️ [AUTH VALIDATION] ${field}: ${error}`)
    }
  }
}

export default authDebug
