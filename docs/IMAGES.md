# Image Hosting & Management

LootAura uses Cloudinary for image hosting and management, providing optimized image delivery and transformation capabilities.

## Current Approach

### Cloudinary Upload Widget (Client-Side)
- **Method**: Unsigned upload preset via Cloudinary Upload Widget
- **Location**: `components/upload/CloudinaryUploadWidget.tsx`
- **Flow**: Direct browser-to-Cloudinary uploads (no server proxy)
- **Security**: Relies on upload preset restrictions, not API keys

### Image Storage
- **Host**: Cloudinary CDN (`res.cloudinary.com`)
- **Format**: Optimized delivery (WebP, AVIF when supported)
- **Transformations**: On-the-fly resizing, cropping, format conversion

## Required Environment Variables

```bash
# Required for image uploads
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

## Upload Preset Configuration

### Recommended Settings
- **Folder**: `lootaura/sales` (for sale photos), `lootaura/test` (for testing)
- **Allowed Sources**: `local`, `camera`, `url`
- **Max File Size**: 10MB
- **Allowed Formats**: `jpg`, `jpeg`, `png`, `webp`
- **Auto-optimization**: Enable format conversion and quality optimization

### Security Restrictions
- **Signing Mode**: Unsigned (relies on preset restrictions)
- **Folder Restrictions**: Limit to `lootaura/*` folders
- **Source Restrictions**: Disable external URLs if not needed
- **Moderation**: Enable if content moderation is required

## Next.js Image Configuration

The app is configured to optimize Cloudinary images via `next/image`:

```javascript
// next.config.js
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'res.cloudinary.com',
      pathname: '/**',
    },
    // ... other patterns
  ],
}
```

## API Integration

### Image URL Validation
- **Validator**: `lib/images/validateImageUrl.ts`
- **Scope**: Only accepts `https://res.cloudinary.com/<cloud>/image/upload/**`
- **Usage**: Applied to `cover_image_url` (sales) and `image_url` (items)

### Database Fields
- **Sales**: `cover_image_url` (first uploaded photo)
- **Items**: `image_url` (individual item photos)

## Content Security Policy

The CSP allows Cloudinary resources:

```javascript
// next.config.js headers
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://widget.cloudinary.com;"
"img-src 'self' data: https: https://res.cloudinary.com;"
"connect-src 'self' https: https://api.cloudinary.com;"
"frame-src 'none' https://widget.cloudinary.com;"
```

## Troubleshooting

### "Failed to initialize upload widget"
- **Cause**: Missing environment variables or CSP blocking
- **Fix**: Verify `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` and `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` are set
- **Check**: Browser console for CSP violations

### "Image not rendering with next/image"
- **Cause**: Missing `res.cloudinary.com` in Next.js image allowlist
- **Fix**: Ensure `next.config.js` includes the Cloudinary remote pattern
- **Verify**: Check Admin Tools → Cloudinary Diagnostics

### Upload Preset Errors
- **Cause**: Preset restrictions or invalid configuration
- **Fix**: Verify preset allows the requested folder and file types
- **Test**: Use Admin Tools → Cloudinary Diagnostics → "Open Widget Smoke Test"

### Invalid Image URL Errors (400)
- **Cause**: Non-Cloudinary URLs or wrong cloud name
- **Fix**: Ensure URLs match `https://res.cloudinary.com/<cloud>/image/upload/**`
- **Debug**: Check `NEXT_PUBLIC_DEBUG=true` for rejection logs

## Admin Diagnostics

The Admin Tools include a Cloudinary diagnostics card that shows:
- ✅ Cloud name present
- ✅ Upload preset present  
- ✅ Next.js image allowlist OK
- ✅ Sample transformation URL health
- Interactive widget smoke test

Access via: `/admin/tools` → Cloudinary Diagnostics

## Development vs Production

### Development
- Upload widget works with local environment variables
- Images served from Cloudinary CDN
- Debug logging available with `NEXT_PUBLIC_DEBUG=true`

### Production
- Same upload flow, different environment variables
- Images cached and optimized by Cloudinary
- No debug logging in production builds

## Future Considerations

- **Signed Uploads**: For additional security (requires server-side API key)
- **Image Moderation**: Enable Cloudinary's AI content moderation
- **Advanced Transformations**: Dynamic cropping, face detection, etc.
- **Video Support**: Extend to video uploads if needed
