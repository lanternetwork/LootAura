# Debug Diagnostics System

This document describes the comprehensive debug diagnostics system implemented for LootAura's authentication and application monitoring.

## Overview

The debug system is gated by the `NEXT_PUBLIC_DEBUG` environment variable and provides comprehensive logging, monitoring, and diagnostic capabilities for development and troubleshooting.

## Environment Configuration

### Development Mode
```bash
NEXT_PUBLIC_DEBUG=true
NODE_ENV=development
```

### Production Mode
```bash
NEXT_PUBLIC_DEBUG=false
NODE_ENV=production
```

## Debug Modules

### 1. Authentication Debug (`lib/debug/authDebug.ts`)

Provides comprehensive authentication flow debugging:

#### Features
- **Auth Flow Logging**: Track sign-in, sign-up, OAuth, magic link flows
- **Session State Monitoring**: Log session creation, validation, expiration
- **Profile State Tracking**: Monitor profile creation and updates
- **Error Logging**: Detailed error reporting with context
- **Rate Limiting**: Track rate limit hits and blocks
- **Security Events**: Log security-related events
- **Performance Monitoring**: Track auth operation timing

#### Usage
```typescript
import { authDebug } from '@/lib/debug/authDebug'

// Log auth flow
authDebug.logAuthFlow('signin', 'password-validation', 'success', { userId: '123' })

// Log session state
authDebug.logSessionState(session)

// Log errors
authDebug.logAuthError('signin', error)

// Log performance
const startTime = Date.now()
// ... operation
authDebug.logPerformance('signin', startTime)
```

### 2. Map Debug (`lib/debug/mapDebug.ts`)

Provides map-specific debugging capabilities:

#### Features
- **Map Load Tracking**: Monitor map component loading states
- **Token Status**: Check Google Maps API token availability
- **State Logging**: Track map state changes
- **Performance Monitoring**: Measure map operation timing

### 3. Debug Configuration (`lib/debug/config.ts`)

Centralized debug configuration management:

#### Features
- **Feature Toggles**: Enable/disable specific debug features
- **Environment Detection**: Automatic debug mode detection
- **Configuration Management**: Centralized debug settings

## Debug Dashboard

### Auth Debug Dashboard (`components/debug/AuthDebugDashboard.tsx`)

A real-time debug dashboard that provides:

#### Features
- **Session State**: Live session information
- **Profile Data**: Current user profile state
- **Cookie Information**: Browser cookie details
- **Performance Metrics**: Memory usage and load times
- **Environment Info**: Current environment details
- **Console Integration**: Direct console logging

#### Usage
The debug dashboard automatically appears when `NEXT_PUBLIC_DEBUG=true` and provides:
- Toggle button in bottom-right corner
- Real-time data updates every 5 seconds
- Console integration for detailed logging
- Performance monitoring

## Debug Logging Patterns

### 1. Auth Flow Logging
```typescript
authDebug.logAuthFlow('signin', 'password-validation', 'success', {
  userId: user.id,
  email: user.email,
  timestamp: Date.now()
})
```

### 2. Error Logging
```typescript
authDebug.logAuthError('signin', error, {
  endpoint: '/api/auth/signin',
  method: 'POST',
  userAgent: request.headers.get('user-agent')
})
```

### 3. Performance Logging
```typescript
const startTime = Date.now()
// ... operation
authDebug.logPerformance('profile-creation', startTime)
```

### 4. Security Event Logging
```typescript
authDebug.logSecurityEvent('rate-limit-exceeded', {
  endpoint: '/api/auth/signin',
  ip: request.ip,
  userAgent: request.headers.get('user-agent')
})
```

## Debug Features by Component

### Authentication Routes
- **Magic Link**: Flow tracking, email validation, error handling
- **Password Reset**: Request tracking, email sending, completion status
- **Sign In/Sign Up**: Flow monitoring, validation, session creation
- **OAuth Callback**: Code exchange, profile creation, error handling
- **Profile Management**: Creation, updates, idempotency

### Middleware
- **Route Protection**: Authentication checks, redirects
- **Session Validation**: Session state monitoring
- **Profile Upsert**: Automatic profile creation

### Frontend Components
- **Sign In Page**: Form validation, magic link sending, error display
- **Debug Dashboard**: Real-time monitoring, console integration

## Security Considerations

### Data Privacy
- **Email Masking**: Email addresses are masked in logs (test***@example.com)
- **User ID Truncation**: User IDs are truncated for privacy
- **Sensitive Data**: No passwords or tokens are logged
- **PII Protection**: Personal information is masked or excluded

### Production Safety
- **Environment Gating**: Debug features only active when explicitly enabled
- **No Production Logs**: Debug logging disabled in production
- **Performance Impact**: Minimal performance impact when disabled

## Debug Commands

### Console Commands
```javascript
// Clear debug console
console.clear()

// Log current debug state
console.log('🔧 AUTH DEBUG DATA:', debugData)

// Enable/disable specific features
debugConfig.auth.logFlows = true
```

### Environment Variables
```bash
# Enable all debug features
NEXT_PUBLIC_DEBUG=true

# Disable debug features
NEXT_PUBLIC_DEBUG=false

# Development mode (auto-enables debug)
NODE_ENV=development
```

## Troubleshooting Guide

### Common Issues

1. **Debug Dashboard Not Showing**
   - Check `NEXT_PUBLIC_DEBUG=true`
   - Verify environment variables are loaded
   - Check browser console for errors

2. **Missing Debug Logs**
   - Ensure debug is enabled
   - Check console filter settings
   - Verify debug functions are called

3. **Performance Issues**
   - Debug logging has minimal impact
   - Disable debug in production
   - Check for excessive logging

### Debug Checklist

- [ ] `NEXT_PUBLIC_DEBUG=true` set
- [ ] Debug dashboard visible
- [ ] Console logs appearing
- [ ] Auth flows tracked
- [ ] Errors logged properly
- [ ] Performance metrics available

## Best Practices

1. **Use Debug Logging Sparingly**: Only log essential information
2. **Mask Sensitive Data**: Never log passwords, tokens, or full PII
3. **Performance Aware**: Debug logging should not impact performance
4. **Environment Specific**: Different debug levels for different environments
5. **Clear Documentation**: Document debug features and usage

## Future Enhancements

- **Remote Debug Logging**: Send debug logs to external service
- **Debug Analytics**: Track debug usage and patterns
- **Custom Debug Levels**: More granular debug control
- **Debug Export**: Export debug data for analysis
- **Integration Testing**: Debug-aware test utilities

