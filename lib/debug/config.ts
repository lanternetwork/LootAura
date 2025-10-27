/**
 * Debug Configuration
 * Controls debug features across the application
 */

export interface DebugConfig {
  enabled: boolean
  auth: {
    enabled: boolean
    logFlows: boolean
    logSessions: boolean
    logErrors: boolean
    logPerformance: boolean
    logSecurity: boolean
  }
  map: {
    enabled: boolean
    logLoads: boolean
    logPerformance: boolean
    logState: boolean
  }
  api: {
    enabled: boolean
    logRequests: boolean
    logResponses: boolean
    logErrors: boolean
  }
  ui: {
    enabled: boolean
    showDashboard: boolean
    showOverlays: boolean
  }
}

const isDebugEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV === 'development'
}

export const debugConfig: DebugConfig = {
  enabled: isDebugEnabled(),
  auth: {
    enabled: isDebugEnabled(),
    logFlows: isDebugEnabled(),
    logSessions: isDebugEnabled(),
    logErrors: isDebugEnabled(),
    logPerformance: isDebugEnabled(),
    logSecurity: isDebugEnabled(),
  },
  map: {
    enabled: isDebugEnabled(),
    logLoads: isDebugEnabled(),
    logPerformance: isDebugEnabled(),
    logState: isDebugEnabled(),
  },
  api: {
    enabled: isDebugEnabled(),
    logRequests: isDebugEnabled(),
    logResponses: isDebugEnabled(),
    logErrors: isDebugEnabled(),
  },
  ui: {
    enabled: isDebugEnabled(),
    showDashboard: isDebugEnabled(),
    showOverlays: isDebugEnabled(),
  },
}

export const getDebugConfig = (): DebugConfig => debugConfig

export const isDebugFeatureEnabled = (feature: keyof DebugConfig): boolean => {
  if (feature === 'enabled') {
    return debugConfig.enabled
  }
  return debugConfig.enabled && (debugConfig[feature] as any).enabled
}

export default debugConfig

