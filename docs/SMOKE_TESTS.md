# Smoke Test Checklist

**Last updated: 2025-10-31**

This document provides a smoke test checklist for staging and production deployments to verify core functionality after deployment.

## Purpose

Smoke tests are quick, critical-path checks to ensure basic functionality works after deployment. These should be run:
- **After deployment to staging** - Before promoting to production
- **After deployment to production** - Before marking deployment as complete
- **After configuration changes** - Environment variables, feature flags, etc.

## Pre-Deployment Checklist

Before running smoke tests, verify:
- [ ] All required environment variables are set (see `docs/PRODUCTION_ENV.md`)
- [ ] Database migrations are applied (if applicable)
- [ ] Vercel deployment completed successfully
- [ ] Build logs show no critical errors

## Smoke Test Checklist

### 1. Load Sales Page (`/sales`)

**Test**: Navigate to `/sales` page

**Expected Results**:
- [ ] Page loads without errors
- [ ] Map displays correctly (no blank map)
- [ ] Sale cards render with images on top (if sales have images)
- [ ] Placeholder displays for sales without images (gray placeholder, not runtime error)
- [ ] Map pins/clusters render correctly
- [ ] Filters bar is visible and functional

**Common Issues**:
- Blank map → Check `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- No sales showing → Check Supabase connection and RLS policies
- Runtime errors → Check browser console and server logs

---

### 2. Sale Detail Page (`/sales/[id]`)

**Test**: Open a sale that has images

**Expected Results**:
- [ ] Detail page loads without errors
- [ ] Cover image displays (same image as list view)
- [ ] Image gallery works (if multiple images)
- [ ] Map shows sale location correctly
- [ ] Back navigation works

**Common Issues**:
- Image not loading → Check `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` and Cloudinary CDN access
- Map not showing → Check Mapbox token

---

### 3. Create Sale with Images

**Test**: Create a new sale with 2 images

**Expected Results**:
- [ ] Image upload works (Cloudinary widget opens)
- [ ] Images upload successfully
- [ ] Cover image is selected automatically (first uploaded image)
- [ ] Sale creates successfully
- [ ] Sale appears in list view with selected cover image

**Common Issues**:
- Upload widget doesn't open → Check `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- Upload fails → Check Cloudinary configuration and CSP headers
- Cover image not showing → Check `cover_image_url` field in database

---

### 4. Create Sale Without Images

**Test**: Create a new sale with no images

**Expected Results**:
- [ ] Sale creates successfully
- [ ] Sale appears in list view
- [ ] Gray placeholder displays (not a runtime error)
- [ ] Placeholder is properly sized and centered

**Common Issues**:
- Runtime error when no images → Check placeholder component rendering
- Placeholder not showing → Check `SalePlaceholder` component import

---

### 5. ZIP Code Filter

**Test**: Enter a ZIP code in the filters

**Expected Results**:
- [ ] Map centers on ZIP code location
- [ ] Sales list updates to show sales in that area
- [ ] Map still drives the list (no regression from map-centric work)
- [ ] Clear ZIP input works (removes filter)

**Common Issues**:
- ZIP lookup fails → Check geocoding API (Mapbox or Nominatim fallback)
- Map doesn't center → Check `handleZipSubmit` function
- List doesn't update → Check map viewport change handlers

---

### 6. Rate Limiting

**Test**: Make multiple rapid requests to `/api/sales`

**Expected Results**:
- [ ] First requests succeed normally
- [ ] After rate limit threshold, requests return 429 status
- [ ] Rate limit headers are present (`X-RateLimit-*`)
- [ ] Logs show rate limit events (check server logs)

**Common Issues**:
- Rate limiting not working → Check `RATE_LIMITING_ENABLED=true` and Upstash Redis config
- No logs → Check `lib/rateLimit/withRateLimit.ts` logging

---

### 7. Image Validation

**Test**: Attempt to create a sale with an invalid image URL

**Expected Results**:
- [ ] Request returns 400 status
- [ ] Error message indicates invalid URL
- [ ] Logs show image validation failure (check server logs)

**Common Issues**:
- Invalid URLs accepted → Check `lib/images/validateImageUrl.ts`
- No logs → Check `app/api/sales/route.ts` logging

---

### 8. Test/Demo Sales Flag

**Test**: Verify demo sales behavior on landing page

**Expected Results**:
- [ ] When `NEXT_PUBLIC_ENABLE_TEST_SALES=false` (default): No demo sales appear on landing page
- [ ] When `NEXT_PUBLIC_ENABLE_TEST_SALES=true`: Demo sales appear on landing page "Featured sales" section
- [ ] Demo sales show "Demo" badge on sale cards
- [ ] Demo sales do NOT appear in `/sales` map or list view
- [ ] Demo sales do NOT appear in API responses (`/api/sales`)

**Common Issues**:
- Demo sales appearing everywhere → Verify flag is only checked in `components/landing/FeaturedSalesSection.tsx`
- Landing page empty when flag enabled → Check `lib/demo/demoSales.ts` returns valid demo data

**Note**: Setting `NEXT_PUBLIC_ENABLE_TEST_SALES=true` will make the landing page look populated even if the database is empty. This is intended for demos and staging environments.

---

## Post-Deployment Checklist

After completing smoke tests:
- [ ] All tests pass
- [ ] No errors in browser console
- [ ] No errors in server logs
- [ ] Performance metrics acceptable (Core Web Vitals)
- [ ] Monitoring/alerting is active

## Quick Test Script

For automated smoke testing, you can use:

```bash
# Test sales page loads
curl -I https://lootaura.com/sales

# Test API endpoint
curl https://lootaura.com/api/sales?lat=38.2527&lng=-85.7585

# Test health endpoint
curl https://lootaura.com/api/health
```

## Related Documentation

- **Production ENV**: See `docs/PRODUCTION_ENV.md` for environment variable checklist
- **Operations**: See `docs/OPERATIONS.md` for monitoring and troubleshooting
- **Images**: See `docs/IMAGES.md` for image upload and validation details

