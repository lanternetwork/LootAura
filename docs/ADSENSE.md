# Google AdSense Integration

This document explains how Google AdSense is integrated into LootAura, including configuration, verification, and ad placement.

## Overview

LootAura uses Google AdSense to display non-personalized ads throughout the application. The integration is controlled via environment variables and only loads in production when explicitly enabled.

## Environment Variables

### Required Variables

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `NEXT_PUBLIC_ENABLE_ADSENSE` | Enable/disable AdSense ads (`"true"` or `"false"`) | Vercel dashboard → Environment Variables |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Google site verification code (optional) | Vercel dashboard → Environment Variables |

### Configuration

- **`NEXT_PUBLIC_ENABLE_ADSENSE`**: Set to `"true"` to enable ads. When `"false"` or unset, all ad components render nothing and the AdSense script is not loaded.
- **`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`**: The verification code provided by Google Search Console for site verification. If not set, the verification meta tag is not rendered.

## Site Verification

Google site verification is performed via a server-rendered meta tag in the root layout (`app/layout.tsx`):

```html
<meta name="google-site-verification" content="<verification-code>" />
```

### Updating the Verification Code

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add or verify your property
3. Choose the "HTML tag" verification method
4. Copy the `content` value from the meta tag
5. Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in your Vercel environment variables
6. Redeploy the application

The verification meta tag is only rendered when `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is set.

## AdSense Account Meta Tag

The AdSense account meta tag is always present in the `<head>` section:

```html
<meta name="google-adsense-account" content="ca-pub-8685093412475036" />
```

This tag is required for Google to verify the domain and is not conditional.

## AdSense Script Loading

The AdSense bootstrap script is loaded conditionally:

- **Only in production**: The script only loads when `NODE_ENV === "production"`
- **Only when enabled**: The script only loads when `NEXT_PUBLIC_ENABLE_ADSENSE === "true"`

The script is loaded using Next.js's `<Script>` component with `strategy="afterInteractive"`:

```tsx
{isProduction() && ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE && (
  <Script
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8685093412475036"
    strategy="afterInteractive"
    crossOrigin="anonymous"
  />
)}
```

## Ad Slots

LootAura uses three AdSense ad slots:

| Slot Name | Slot ID | Component | Location |
|-----------|---------|-----------|----------|
| `lootaura_sale_detail_banner` | `6194845043` | `SaleDetailBannerAd` | Sale detail page (sidebar on desktop, below content on mobile) |
| `lootaura_mobile_list_inline` | `2129152111` | `MobileListInlineAd` / `ListInlineAd` | Sales list (every 6 sales, mobile and desktop) |
| `lootaura_desktop_footer` | `2367280679` | `DesktopFooterAd` | Footer (desktop only, hidden on `/sales` page) |

### Ad Placement

- **Sale Detail Page**: Banner ad appears in the sidebar on desktop and below the main content on mobile
- **Sales List**: Inline ads appear every 6 sales in the list
- **Desktop Footer**: Footer ad appears on all pages except `/sales` (where inline ads are used instead)

## Non-Personalized Ads

All ads are configured as **non-personalized** using the `data-npa="1"` attribute on each ad slot. This means:

- Ads are not personalized based on user behavior or interests
- No "See fewer ads" options are shown
- Complies with privacy requirements (GDPR, CCPA, etc.)

The non-personalized configuration is set in `components/ads/AdSenseSlot.tsx`:

```tsx
<ins
  className="adsbygoogle"
  data-ad-client="ca-pub-8685093412475036"
  data-ad-slot={slot}
  data-ad-format="auto"
  data-full-width-responsive="true"
  data-npa="1"  // Non-personalized ads
/>
```

## ads.txt

The `ads.txt` file is located at `/public/ads.txt` and is automatically served at `https://lootaura.app/ads.txt`.

### Current Entry

```
google.com, pub-8685093412475036, DIRECT, f08c47fec0942fa0
```

### Adding Additional Sellers

If you need to add additional ad sellers in the future, edit `/public/ads.txt` and add new lines following the [ads.txt specification](https://iabtechlab.com/ads-txt/):

```
google.com, pub-8685093412475036, DIRECT, f08c47fec0942fa0
example.com, pub-1234567890, RESELLER, abc123
```

After updating, commit and deploy. The file is served statically by Next.js.

## Content Security Policy (CSP)

The Content Security Policy in `next.config.js` includes the following AdSense-related directives:

- **`script-src`**: Allows scripts from `https://pagead2.googlesyndication.com`, `https://googleads.g.doubleclick.net`, and `https://ep2.adtrafficquality.google`
- **`frame-src`**: Allows frames from `https://googleads.g.doubleclick.net`, `https://tpc.googlesyndication.com`, `https://*.googlesyndication.com`, `https://ep2.adtrafficquality.google`, and `https://www.google.com`
- **`connect-src`**: Allows network connections to AdSense domains
- **`img-src`**: Allows images from `https:` (covers ad images)

The CSP is already configured correctly and should not need modification unless Google adds new domains.

## Component Structure

### AdSenseSlot

The core ad component (`components/ads/AdSlots.tsx`) handles:

- Client-side rendering (requires `'use client'`)
- Environment variable checking via `ENV_PUBLIC`
- Safe initialization of `window.adsbygoogle`
- Retry logic for script loading
- Non-personalized ads configuration

### Ad Slot Components

Each ad slot has its own component in `components/ads/AdSlots.tsx`:

- `SaleDetailBannerAd`: Sale detail page banner
- `MobileListInlineAd`: Mobile list inline ad
- `ListInlineAd`: Desktop list inline ad
- `DesktopFooterAd`: Desktop footer ad

All components:
- Check `ENV_PUBLIC.NEXT_PUBLIC_ENABLE_ADSENSE` before rendering
- Return `null` when ads are disabled
- Use `AdSenseSlot` for the actual ad rendering

## Testing

Tests are located in:

- `tests/unit/adsense.meta.test.ts`: Tests for meta tags and script loading
- `tests/unit/adsense.components.test.tsx`: Tests for ad components
- `tests/unit/ads.txt.test.ts`: Tests for ads.txt file

Run tests with:

```bash
npm test tests/unit/adsense
```

## Troubleshooting

### Ads Not Showing

1. **Check environment variables**:
   - Verify `NEXT_PUBLIC_ENABLE_ADSENSE` is set to `"true"` in production
   - Verify `NODE_ENV` is `"production"` in production

2. **Check browser console**:
   - Look for AdSense errors or warnings
   - Check for CSP violations
   - Verify the AdSense script is loading

3. **Check ad blocker**:
   - Ad blockers may prevent ads from loading
   - Test in incognito mode or with ad blocker disabled

4. **Check AdSense account**:
   - Verify the account is approved and active
   - Check for policy violations or account issues

### Site Verification Failing

1. **Check meta tag**:
   - Verify `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` is set correctly
   - Check that the meta tag appears in the rendered HTML (view page source)

2. **Wait for propagation**:
   - Google may take up to 24 hours to verify
   - Try re-verifying after waiting

3. **Check HTML tag method**:
   - Ensure you're using the "HTML tag" method in Google Search Console
   - The verification code should match exactly

### ads.txt Not Found

1. **Check file location**:
   - File should be at `/public/ads.txt`
   - Next.js automatically serves files from `/public` at the root

2. **Check deployment**:
   - Ensure the file is committed to the repository
   - Verify the file is included in the build

3. **Test URL**:
   - Visit `https://lootaura.app/ads.txt` directly
   - Should return the ads.txt content

## Manual Verification Steps

After deploying AdSense changes:

1. **Wait 24 hours** for Google's cooldown period (if re-verifying)
2. **Re-add site in AdSense** using HTML tag verification method
3. **Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`** to the new verification code
4. **Deploy** the application
5. **Verify**:
   - Visit `https://lootaura.app` and view page source
   - Check that `google-adsense-account` meta tag is present
   - Check that `google-site-verification` meta tag is present (if env var is set)
   - Visit `https://lootaura.app/ads.txt` and verify content
6. **Retry verification** in Google Search Console / AdSense

## Security Notes

- AdSense publisher ID (`ca-pub-8685093412475036`) is public and safe to expose
- The verification code is also public (it's in the HTML)
- No sensitive credentials are stored in environment variables
- CSP is configured to allow only necessary AdSense domains

## References

- [Google AdSense Documentation](https://support.google.com/adsense)
- [ads.txt Specification](https://iabtechlab.com/ads-txt/)
- [Google Search Console](https://search.google.com/search-console)
- [Non-Personalized Ads](https://support.google.com/adsense/answer/9007336)

