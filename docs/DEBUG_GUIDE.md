# LootAura Debug Guide

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

This guide explains how to use the unified debug system to diagnose issues and verify system behavior.

## Debug System Overview

### Single Debug Flag
- **Flag**: `NEXT_PUBLIC_DEBUG` (boolean)
- **Purpose**: Single on/off switch for all debug features
- **Policy**: No additional debug flags allowed
- **Security**: No PII (personally identifiable information) in logs

### Admin Tools Interface
- **URL**: `/admin/tools` (publicly accessible)
- **Purpose**: Comprehensive debugging and development tools
- **Features**: Debug controls, sale lookup, system information, health checks

### Enabling Debug Mode

#### Local Development
```bash
# Set environment variable
NEXT_PUBLIC_DEBUG=true

# Or in .env.local
echo "NEXT_PUBLIC_DEBUG=true" >> .env.local
```

#### Vercel Deployment
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add: `NEXT_PUBLIC_DEBUG` = `true`
3. Redeploy to apply changes

#### Browser Console
```javascript
// Check if debug mode is enabled
console.log('Debug mode:', process.env.NEXT_PUBLIC_DEBUG === 'true')
```

## Admin Tools Interface

### Accessing Admin Tools
Visit `/admin/tools` to access comprehensive debugging and development tools:

#### Available Tools
- **Debug Controls**: Toggle debug mode and show/hide diagnostics overlay
- **Review Key Lookup**: Look up sale information by sale ID
- **System Information**: View environment variables and configuration
- **Health Checks**: Quick access to system health endpoints
- **Diagnostic Overlay**: Real-time monitoring of fetch events

#### Sale Lookup Tool
- **Purpose**: Debug sale data and review key generation
- **Input**: Sale ID (searches across multiple tables)
- **Output**: Complete sale information, address key, review key, review count
- **Tables**: Searches `sales_v2`, `sales`, and `yard_sales` tables

#### System Information
- **Environment**: Development/Production status
- **Debug Mode**: Current debug state
- **Clustering**: Feature flag status  
- **Schema**: Current Supabase schema

#### Health Check Links
- **Overall Health**: `/api/health`
- **Database**: `/api/health/db`
- **Mapbox**: `/api/health/mapbox`
- **Supabase**: `/api/health/supabase`

## Debug Features

### 1. Filter Normalization Debugging

#### Where to See
- **Client**: Browser console with `[FILTERS]` prefix
- **Server**: Server logs with `[API]` prefix

#### What You'll See
```javascript
// Client-side filter normalization
[FILTERS] cats norm prev=tools next=tools,furniture changed=true
[FILTERS] updateFilters called with: {categories: ['tools', 'furniture']}

// Server-side parameter parsing
[API][markers] cats received=tools,furniture norm=tools,furniture
[API][markers] cats norm=tools,furniture where=in count=15
```

#### Troubleshooting
- **Empty Categories**: Check if `categories=[]` is being sent
- **Legacy Parameters**: Verify `cat` is being migrated to `categories`
- **Normalization**: Ensure arrays are sorted and deduplicated

### 2. Payload Equality Debugging

#### Where to See
- **Client**: Browser console with `[ARB]` prefix
- **Network**: Network tab showing request payloads

#### What You'll See
```javascript
// Arbiter decision making
[ARB] evaluate mapAuth=true shouldSkipNetwork=false shouldUpdateUI=true
[ARB] payload equality: markers={categories:['tools']} list={categories:['tools']} equal=true

// Suppression decision
[ARB] suppression: authority=MAP equalFilters=true suppressed=true
```

#### Troubleshooting
- **Suppression Issues**: Check if `equalFilters` is correctly calculated
- **Authority Changes**: Verify authority is stable during filter changes
- **Payload Mismatch**: Compare markers vs list request payloads

### 3. Suppression Decision Debugging

#### Where to See
- **Client**: Browser console with `[ARB]` prefix
- **Visual**: Red "SUPPRESSED" badge in debug overlay

#### What You'll See
```javascript
// Suppression evaluation
[ARB] evaluate mapAuth=true shouldSkipNetwork=true shouldUpdateUI=false
[ARB] suppression: authority=MAP equalFilters=true suppressed=true

// Visual confirmation
[DEBUG] Wide fetch suppressed under MAP authority
```

#### Troubleshooting
- **Over-suppression**: Check if categories are being ignored in equality check
- **Under-suppression**: Verify filter normalization is consistent
- **Authority Issues**: Ensure authority is correctly determined

### 4. DOM Structure Debugging

#### Where to See
- **Client**: Browser console with `[DOM]` prefix
- **Elements**: Browser DevTools Elements tab

#### What You'll See
```javascript
// Container presence
[DOM][LIST] container mounted
[DOM][LIST] grid display=grid gtc=repeat(3, 1fr) parentDisplay=flex parentWidth=800px

// Card counting
[DOM][LIST] cards in panel=12 expected=12
[DOM] item mounts id=abc123
```

#### Troubleshooting
- **Missing Container**: Check for `[data-panel="list"]` element
- **Grid Issues**: Verify grid classes are applied correctly
- **Card Count**: Ensure `[data-card="sale"]` elements are direct children

### 5. ID Parity Debugging

#### Where to See
- **Client**: Browser console with `[LIST]` prefix
- **Network**: Network tab showing response data

#### What You'll See
```javascript
// Marker-list consistency
[LIST][DIFF] seq=3 idsHash=abc123,def456,ghi789 prevSeq=2 changed=true
[LIST] apply visible count=12 seq=3 idsHash=abc123,def456,ghi789

// Parity verification
[LIST][MAP] seq=3 ids.count=12 haveInDict=12 missing=[]
```

#### Troubleshooting
- **Missing IDs**: Check if marker IDs are being passed to list
- **Sequence Issues**: Verify `visibleIdsSeq` is incrementing correctly
- **Hash Changes**: Ensure ID hash calculation is consistent

## Debug Overlay

### Visual Debug Interface
When `NEXT_PUBLIC_DEBUG=true`, a debug overlay appears in the bottom-right corner:

#### Overlay Features
- **Last 10 Fetch Events**: Endpoint, parameters, authority, timing
- **Viewport/Request Sequences**: Monotonically increasing sequence numbers
- **Suppression Status**: Red "SUPPRESSED" badge when list fetch is suppressed
- **Toggle Button**: Show/hide overlay

#### Overlay Content
```
[DEBUG OVERLAY]
Last 10 Events:
1. GET /api/sales/markers?categories=tools (MAP, 150ms)
2. GET /api/sales?categories=tools (FILTER, 200ms) [SUPPRESSED]
3. GET /api/sales/markers?categories=tools,furniture (MAP, 120ms)

Viewport Seq: 15
Request Seq: 23
Authority: MAP
Suppressed: true
```

### Toggle Debug Overlay
```javascript
// Toggle overlay visibility
window.toggleDebugOverlay = () => {
  const overlay = document.querySelector('[data-debug="overlay"]')
  overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none'
}
```

## One-Time Warnings

### Initialization Warnings
```javascript
// One-time warnings that appear once per session
[WARN] Debug mode enabled - performance may be impacted
[WARN] Debug overlay active - disable in production
[WARN] Console logging enabled - check for PII leaks
```

### Configuration Warnings
```javascript
// Configuration issues
[WARN] Missing NEXT_PUBLIC_DEBUG - debug features disabled
[WARN] Invalid debug flag value - expected boolean
[WARN] Debug mode in production - security risk
```

## Debug Logging Standards

### Log Format
```javascript
// Standard log format
console.log('[PREFIX] message', { sanitizedData })

// Examples
console.log('[FILTERS] categories normalized', { categories: ['tools', 'furniture'] })
console.log('[ARB] suppression decision', { authority: 'MAP', suppressed: true })
console.log('[DOM] grid layout', { display: 'grid', columns: 3 })
```

### Log Prefixes
- **`[FILTERS]`**: Filter normalization and updates
- **`[ARB]`**: Arbiter decisions and suppression logic
- **`[DOM]`**: DOM structure and layout
- **`[LIST]`**: List updates and ID parity
- **`[API]`**: Server-side API processing
- **`[DEBUG]`**: General debug information

### Data Sanitization
```javascript
// Good: Sanitized data
console.log('[DEBUG] user action', { action: 'filter_change', category: 'tools' })

// Bad: PII data
console.log('[DEBUG] user action', { email: 'user@example.com', name: 'John Doe' })
```

## Troubleshooting Common Issues

### Debug Mode Not Working
1. **Check Environment**: Verify `NEXT_PUBLIC_DEBUG=true`
2. **Restart Server**: Restart development server after env change
3. **Clear Cache**: Clear browser cache and reload
4. **Check Console**: Look for debug initialization messages

### Missing Debug Logs
1. **Check Flag**: Ensure `NEXT_PUBLIC_DEBUG=true`
2. **Check Prefix**: Look for specific log prefixes
3. **Check Timing**: Some logs only appear during specific actions
4. **Check Browser**: Ensure console is not filtered

### Performance Impact
1. **Disable in Production**: Never enable in production
2. **Limit Log Volume**: Avoid logging in tight loops
3. **Use Conditional**: Only log when debug mode is enabled
4. **Monitor Impact**: Watch for performance degradation

## Debug Best Practices

### Development
- **Enable Early**: Enable debug mode at start of development
- **Monitor Logs**: Watch console for unexpected behavior
- **Test Scenarios**: Test all filter combinations with debug on
- **Document Issues**: Note any debug output that seems wrong

### Testing
- **Debug Tests**: Include debug mode in test scenarios
- **Verify Logs**: Check that expected logs appear
- **Test Disabled**: Ensure app works with debug disabled
- **Performance**: Monitor performance impact of debug mode

### Production
- **Never Enable**: Debug mode should never be enabled in production
- **Monitor Alerts**: Set up alerts for debug mode in production
- **Security**: Ensure no PII is logged even in debug mode
- **Performance**: Debug mode can impact performance significantly

## Debug Disable Checklist

Before deploying to production:

- [ ] `NEXT_PUBLIC_DEBUG=false` in production environment
- [ ] No debug logs in production code
- [ ] Debug overlay disabled
- [ ] Console logging minimized
- [ ] Performance impact assessed
- [ ] Security review completed

---

**Remember: Debug mode is for development and troubleshooting only. Never enable in production.**
