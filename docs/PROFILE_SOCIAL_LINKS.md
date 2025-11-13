# Profile Social Links

This document describes the social links feature for user profiles.

## Overview

Users can add social media profiles and website links to their profile. These links are displayed on their public profile page and can be managed from the dashboard.

## Supported Providers

The following social media platforms and website are supported:

- **Twitter/X** (`twitter`) - `https://twitter.com/{handle}`
- **Instagram** (`instagram`) - `https://instagram.com/{handle}`
- **Facebook** (`facebook`) - `https://facebook.com/{handle}`
- **TikTok** (`tiktok`) - `https://tiktok.com/@{handle}`
- **YouTube** (`youtube`) - `https://youtube.com/@{handle}`
- **Threads** (`threads`) - `https://www.threads.net/@{handle}`
- **Pinterest** (`pinterest`) - `https://pinterest.com/{handle}`
- **LinkedIn** (`linkedin`) - `https://www.linkedin.com/in/{handle}` or full URL
- **Website** (`website`) - Any valid URL

## Normalization

The system automatically normalizes social links to canonical URLs:

### Handle Input
Users can enter either:
- A handle (e.g., `@johndoe` or `johndoe`)
- A full URL (e.g., `https://twitter.com/johndoe`)

### Normalization Rules

1. **Handle Extraction**: If a URL is provided, the system extracts the handle from common URL patterns
2. **@ Removal**: Leading `@` symbols are removed
3. **URL Construction**: Handles are converted to canonical URLs based on provider
4. **Validation**: Invalid handles/URLs are dropped (alphanumeric, underscore, hyphen, dot allowed)
5. **Domain Validation**: For full URLs, the domain is validated against expected domains for each provider

### Examples

- `johndoe` → `https://twitter.com/johndoe`
- `@johndoe` → `https://twitter.com/johndoe`
- `https://twitter.com/johndoe` → `https://twitter.com/johndoe`
- `https://x.com/johndoe` → `https://twitter.com/johndoe` (normalized to twitter.com)
- `example.com` → `https://example.com` (website)
- `https://example.com` → `https://example.com` (website, unchanged)

## Database Schema

Social links are stored as a JSONB column in `lootaura_v2.profiles`:

```sql
social_links JSONB DEFAULT '{}'::jsonb
```

Example data:
```json
{
  "twitter": "https://twitter.com/johndoe",
  "instagram": "https://instagram.com/johndoe",
  "website": "https://example.com"
}
```

## API

### Update Social Links

**Endpoint**: `POST /api/profile/social-links`

**Authentication**: Required (session)

**Request Body**:
```json
{
  "links": {
    "twitter": "johndoe",
    "instagram": "@johndoe",
    "website": "https://example.com"
  }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "social_links": {
      "twitter": "https://twitter.com/johndoe",
      "instagram": "https://instagram.com/johndoe",
      "website": "https://example.com"
    }
  }
}
```

## UI Components

### Dashboard

The `SocialLinksCard` component allows users to manage their social links from the dashboard. It provides:
- Input fields for each supported provider
- Automatic normalization before saving
- Change detection (Save button disabled when no changes)
- Success/error toast notifications

### Public Profile

The `SocialLinksRow` component displays social links on the public profile page:
- Icon buttons for each link
- Opens in new tab with `rel="me noopener noreferrer"`
- Accessible labels and tooltips
- Only displays providers that have links

## Security

- All writes use RLS (Row Level Security) - users can only update their own profile
- Schema-scoped clients ensure writes go to `lootaura_v2.profiles` (not views)
- No server secrets or environment variables required
- Input validation and normalization prevent malicious URLs

## Implementation Details

- **Migration**: `084_add_social_links_to_profiles.sql`
- **Types**: `lib/profile/social.ts`
- **API Route**: `app/api/profile/social-links/route.ts`
- **Dashboard Component**: `components/dashboard/SocialLinksCard.tsx`
- **Public Component**: `components/profile/SocialLinksRow.tsx`

