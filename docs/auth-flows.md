# LootAura authentication flows

## Password recovery (email OTP)

1. User submits forgot-password form → `POST /api/auth/reset-password` → `resetPasswordForEmail` with allowlisted `redirectTo` (`/auth/reset-password`).
2. Supabase sends email. **Dashboard reset template** must link to:
   - `/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`
3. `GET /auth/confirm` → `verifyOtp({ token_hash, type })` → SSR session cookies → redirect to `next` (default `/auth/reset-password`).
4. Reset page assumes session exists → user sets password via `POST /api/auth/update-password`.

**Does not use:** PKCE `code`, `exchangeCodeForSession`, or `/auth/callback` for recovery.

**Legacy links** with `?code=` on `/auth/reset-password` show a message to request a new email (no PKCE repair).

## Google OAuth (PKCE)

1. User starts Google sign-in → Supabase OAuth with PKCE verifier stored in cookies.
2. Provider redirects to `/auth/callback?code=...`.
3. `exchangeCodeForSession(code)` → SSR cookies → redirect to app (e.g. `/sales`).

## Email signup confirmation (PKCE or token_hash)

- **PKCE:** `{{ .ConfirmationURL }}` → `/auth/callback?code=...` → `exchangeCodeForSession`.
- **token_hash:** `/auth/callback?token_hash=...&type=signup` → shared `verifyOtp` helper (same as `/auth/confirm`).

## Hash-fragment session (legacy mobile / some templates)

- Tokens in URL hash → `/auth/callback/finish` or establish-session path (unchanged).

## Routes summary

| Flow | Query | Handler | Session API |
|------|--------|---------|-------------|
| Recovery | `token_hash`, `type=recovery` | `/auth/confirm` | `verifyOtp` |
| OAuth | `code` | `/auth/callback` | `exchangeCodeForSession` |
| Signup OTP | `token_hash`, `type=signup` | `/auth/callback` | `verifyOtp` |
