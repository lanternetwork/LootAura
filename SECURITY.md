# Security Policy

**Last updated: 2025-01-31**

## Supported Versions

We currently support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Yes             |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, email security@lootaura.com with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if applicable)

We will respond within 48 hours and work with you to resolve the issue.

## Security Best Practices

### Authentication & Authorization

- **Supabase Auth**: All authentication handled through Supabase Auth
- **RLS Policies**: Row Level Security (RLS) policies enforce data access controls
- **Owner-Based Access**: Users can only modify their own data
- **Public Read**: Sales data readable by anonymous users for browsing

### Input Validation

- **Zod Schemas**: All user input validated with Zod schemas
- **URL Validation**: Image URLs validated to ensure Cloudinary URLs only
- **Parameterized Queries**: All database queries use parameterized inputs
- **Sanitization**: User-generated content sanitized before display

### Secrets Management

- **Environment Variables**: All secrets stored in environment variables
- **No Hardcoded Secrets**: No API keys or tokens in source code
- **Vercel Integration**: Secrets managed via Vercel dashboard
- **Access Control**: Least privilege access to production secrets

### Rate Limiting

- **Production-Grade**: Upstash Redis for distributed rate limiting
- **IP-Based**: Rate limits applied per IP address
- **User-Based**: Mutation limits applied per authenticated user
- **Policy Tuning**: Rate limits configurable per endpoint

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for rate limiting details.

### Image Security

- **Cloudinary URLs Only**: All image URLs validated to ensure Cloudinary origin
- **Upload Preset Restrictions**: Upload presets restrict folder, size, and format
- **No External URLs**: External image URLs rejected
- **Content Validation**: Image format and size validated on upload

### Monitoring & Logging

- **No PII in Logs**: No personally identifiable information logged
- **Debug Gating**: All debug logs behind `NEXT_PUBLIC_DEBUG` flag
- **Structured Logging**: Consistent structured logging format
- **Sentry Integration**: Error tracking and monitoring via Sentry

### OWASP Top 10 Compliance

- **A01: Broken Access Control**: RLS policies enforce owner-based access
- **A02: Cryptographic Failures**: HTTPS enforced, secure session management
- **A03: Injection**: Parameterized queries, input validation with Zod
- **A04: Insecure Design**: Threat modeling, secure architecture patterns
- **A05: Security Misconfiguration**: Security headers, CSP policies
- **A06: Vulnerable Components**: Dependency scanning, automated updates
- **A07: Authentication Failures**: Supabase Auth, secure session handling
- **A08: Software Integrity**: CI/CD security gates, signed commits
- **A09: Logging Failures**: Structured logging, security event monitoring
- **A10: Server-Side Request Forgery**: URL validation, allowlist approach

### Dependencies

- **Dependency Scanning**: Automated scanning via CI/CD
- **Dependabot**: GitHub Dependabot for security updates
- **License Compliance**: Automated license checking and approval
- **Regular Updates**: Dependencies updated regularly

### Deployment

- **HTTPS Only**: All traffic over HTTPS
- **Security Headers**: Security headers configured in Next.js
- **Environment Isolation**: Development, staging, and production environments isolated
- **Secret Rotation**: Regular rotation of API keys and tokens

## Security Headers

LootAura includes the following security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`: Configured per environment

## Known Security Considerations

### Public Read Access

Sales data is readable by anonymous users for browsing. This is by design to allow public discovery of yard sales. Sensitive information (email addresses, phone numbers) is not included in public data.

### Image Upload

Users can upload images via Cloudinary's unsigned upload preset. Security is enforced through:
- Upload preset restrictions (folder, size, format)
- Image URL validation (Cloudinary URLs only)
- Content validation on upload

### Rate Limiting

Rate limiting is optional and can be enabled via `RATE_LIMITING_ENABLED` environment variable. When enabled, uses Upstash Redis for distributed rate limiting.

## Security Updates

Security updates are released as needed. Critical vulnerabilities are addressed within 48 hours. Non-critical vulnerabilities are addressed in the next regular release cycle.

For the latest security updates, monitor the repository for security advisories.
