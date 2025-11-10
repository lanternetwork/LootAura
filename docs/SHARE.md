# Social Sharing Feature

## Overview

The social sharing feature allows users to share sale listings via multiple platforms, including native Web Share API support and fallback options for desktop browsers.

## Implementation

### Share Button Component

The `SaleShareButton` component (`components/share/SaleShareButton.tsx`) provides:

- **Web Share API**: Primary sharing method on mobile devices (iOS Safari, Android Chrome)
- **Fallback Menu**: Desktop-friendly menu with multiple share options
- **Accessibility**: Full keyboard navigation and ARIA labels
- **Analytics**: Tracks all share events

### Share Targets

The following share targets are available:

1. **Copy Link**: Copies the share URL to clipboard (with UTM params)
2. **X (Twitter)**: Opens Twitter share dialog
3. **Facebook**: Opens Facebook share dialog
4. **Reddit**: Opens Reddit submit dialog
5. **WhatsApp**: Opens WhatsApp share (mobile only)
6. **Email**: Opens email client with pre-filled subject and body
7. **SMS**: Opens SMS app with pre-filled message (mobile only)

### UTM Parameters

All share URLs include UTM tracking parameters:

- `utm_source=share`: Identifies the source as a share action
- `utm_medium=social`: Identifies the medium as social sharing
- `utm_campaign=sale`: Identifies the campaign as a sale share

These parameters can be customized via the `utm` option in `buildShareTargets()`.

### URL Building

The `buildShareUrls.ts` utility:

- Normalizes relative URLs to absolute URLs
- Uses `NEXT_PUBLIC_SITE_URL` when available
- Falls back to `window.location.origin` in browser
- Falls back to `https://lootaura.app` in SSR or when env is missing
- Appends UTM parameters to all share URLs

### Metadata (OG Tags)

Sale pages include comprehensive Open Graph and Twitter Card metadata:

- **Title**: Sale title (truncated to 60 chars)
- **Description**: Includes location and date information
- **Image**: Uses sale cover image or fallback
- **URL**: Canonical sale URL (without UTM params)

The metadata is generated in `lib/metadata.ts` via `createSaleMetadata()`.

### Analytics

Share events are tracked via the analytics module:

- **Web Share**: `analytics.trackShare(saleId, 'webshare')`
- **Copy Link**: `analytics.trackShare(saleId, 'copy')`
- **Social Platforms**: `analytics.trackShare(saleId, 'twitter'|'facebook'|'reddit'|'whatsapp'|'email'|'sms')`

## Usage

### Basic Usage

```tsx
<SaleShareButton
  url="/sales/sale-id"
  title="Yard Sale"
  text="Check this out!"
  saleId="sale-id"
/>
```

### Building Share URLs

```typescript
import { buildShareTargets } from '@/lib/share/buildShareUrls'

const targets = buildShareTargets({
  url: '/sales/sale-id',
  title: 'Yard Sale',
  text: 'Check this out!',
  utm: {
    source: 'custom',
    medium: 'email',
    campaign: 'promo',
  },
})
```

## Browser Support

- **Web Share API**: iOS Safari 12.1+, Android Chrome 89+, Edge 93+
- **Clipboard API**: Modern browsers (Chrome 66+, Firefox 63+, Safari 13.1+)
- **Fallback**: Uses `document.execCommand('copy')` for older browsers
- **Mobile Detection**: Uses user agent and screen width

## Accessibility

- Full keyboard navigation support
- ARIA labels and roles
- Focus management
- Screen reader friendly

## Testing

- Unit tests: `tests/unit/share.buildShareUrls.test.ts`
- Integration tests: `tests/integration/sale.share-button.render.test.tsx`

## Notes

- Web Share API is not available on desktop Safari (limited support)
- Copy Link option is hidden if clipboard API is unavailable
- Mobile-only options (WhatsApp, SMS) are hidden on desktop
- UTM parameters are only added to share URLs, not canonical URLs

