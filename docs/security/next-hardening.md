# Next.js Security Hardening

This document outlines the security mitigations implemented to address Dependabot advisories for Next.js vulnerabilities.

## Security Headers

### Global Headers
- **X-Content-Type-Options**: `nosniff` - Prevents MIME type sniffing
- **X-Frame-Options**: `DENY` - Prevents clickjacking attacks
- **Referrer-Policy**: `no-referrer` - Prevents referrer leakage
- **Permissions-Policy**: Disables camera, microphone, and geolocation by default
- **Content-Security-Policy**: Restricts resource loading to prevent XSS

### Cache Control
- **Authenticated Routes**: `no-store, no-cache, must-revalidate` for `/api/auth/*` and `/api/sales/*`
- **User-Specific Data**: Prevents caching of sensitive user information

## Image Security

### Remote Pattern Restrictions
- Limited to required hosts only:
  - `*.supabase.co` and `*.supabase.in` for Supabase storage
  - `storage.googleapis.com` for Google Cloud Storage
- **SVG Blocking**: `dangerouslyAllowSVG: false` prevents SVG-based XSS
- **Format Restrictions**: Only allows `image/webp` and `image/avif`
- **Size Limits**: Reasonable device and image size limits

## Middleware Security

### Matcher Configuration
- Excludes static assets: `/_next/*`, `/static/*`, `/favicon.ico`, `/robots.txt`, `/manifest.webmanifest`, `/images/*`
- Excludes health endpoints: `/api/health/*`
- Prevents unnecessary middleware execution

### Redirect Safety
- **Same-Origin Validation**: Only allows relative paths starting with `/`
- **Fallback Protection**: Invalid redirects fall back to `/`
- **No External Redirects**: Prevents open redirect vulnerabilities

## Server Actions Security

### Body Size Limits
- **1MB Limit**: Prevents DoS attacks via large payloads
- **Memory Protection**: Limits memory consumption from malicious requests

## Route Cache Safety

### Dynamic Rendering
- **Authenticated Routes**: All user-specific routes use dynamic rendering
- **API Routes**: User-specific APIs return `Cache-Control: no-store`
- **Session Data**: Prevents caching of sensitive session information

## Development Security

### Debug Logging
- **Environment Guards**: All debug logs are wrapped in `process.env.NEXT_PUBLIC_DEBUG === 'true'`
- **Production Safety**: Debug information never exposed in production
- **Health Endpoints**: Only return minimal, non-sensitive status information

## Dependabot Mitigation Mapping

| Advisory | Mitigation |
|----------|------------|
| Auth bypass in middleware | Safe redirect validation, explicit route matching |
| Cache poisoning | `no-store` headers for authenticated routes |
| SSRF via redirects | Same-origin redirect validation |
| Image optimization issues | Restricted remote patterns, SVG blocking |
| Server Actions DoS | 1MB body size limit |
| Dev-info exposure | Environment-guarded debug logs |

## Implementation Notes

- **Minimal Changes**: Security hardening preserves existing functionality
- **Backward Compatibility**: All changes are additive, no breaking changes
- **Performance**: Security headers have minimal performance impact
- **Testing**: All changes validated through CI pipeline

## Future Improvements

- **CSP Nonces**: Migrate from `unsafe-inline` to nonce-based CSP
- **Strict Transport**: Add HSTS headers for HTTPS enforcement
- **Additional Headers**: Consider adding `X-XSS-Protection` and `Strict-Transport-Security`
