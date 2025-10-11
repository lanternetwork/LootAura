# Troubleshooting Guide

This document covers common issues and their solutions in LootAura.

## Search & Filtering Issues

### "Search Performance Notice" Banner Appears
**Cause**: The system is using bounding box approximation instead of PostGIS distance calculations.

**Solution**: 
- This should be rare with the current implementation
- The banner only appears if PostGIS fails
- Check server logs for PostGIS errors
- Verify the `search_sales_by_distance` RPC function exists

### No Sales Appear
**Cause**: Missing location, API errors, or MAP authority list not deriving from visible pins.

**Solutions**:
1. Ensure you have a valid location (ZIP code or GPS)
2. Check browser console for API errors
3. If in MAP authority: confirm visible pin IDs are emitted and list derives from those IDs
4. Verify the sales API is returning data
5. Try different location/ZIP codes

### Category Filters Not Working
**Cause**: Categories missing from database or API issues.

**Solutions**:
1. Go to `/check-categories` to verify category status
2. Use "Fix Categories (Robust)" if categories are missing
3. Check browser console for JavaScript errors
4. Verify the sales API includes category data

### Distance Slider Not Working
**Cause**: API not responding to distance changes.

**Solutions**:
1. Check browser console for API errors
2. Verify the distance parameter is being sent
3. Try different distance values
4. Check if PostGIS is working properly

## Location Issues

### ZIP Code Lookup Fails
**Cause**: ZIP not in database or geocoding service down.

**Solutions**:
1. Try different ZIP codes
2. Check if ZIP database is populated (`/test-zipcodes`)
3. Verify Nominatim fallback is working
4. Check for rate limiting on geocoding services

### Map Not Updating
**Cause**: Map component not receiving new location data or Mapbox token/config issues.

**Solutions**:
1. Check if location state is updating
2. Verify map center coordinates are changing
3. Check browser console for map errors (Mapbox GL JS)
4. Confirm `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set and valid
5. Try refreshing the page

## Performance Issues

### Slow Search Results
**Cause**: Database queries not optimized or PostGIS unavailable.

**Solutions**:
1. Check if PostGIS is working (no degraded banner)
2. Verify database indexes are in place
3. Check for database connection issues
4. Monitor server logs for slow queries

### High Memory Usage
**Cause**: Large datasets or inefficient queries.

**Solutions**:
1. Implement pagination for large result sets
2. Optimize database queries
3. Check for memory leaks in client code
4. Monitor server resource usage

## Database Issues

### Schema Errors
**Cause**: Wrong schema configuration or missing tables.

**Solutions**:
1. Verify `NEXT_PUBLIC_SUPABASE_SCHEMA` environment variable
2. Check if required tables exist
3. Run database migrations if needed
4. Verify RLS policies are correct

### Connection Errors
**Cause**: Supabase configuration issues.

**Solutions**:
1. Check environment variables
2. Verify Supabase project is active
3. Check network connectivity
4. Verify API keys are correct

## Development Issues

### Build Failures
**Cause**: Missing dependencies or TypeScript errors.

**Solutions**:
1. Run `npm install` to install dependencies
2. Check for TypeScript compilation errors
3. Verify all required environment variables
4. Check for missing files or imports

### Deployment Issues
**Cause**: Vercel configuration or environment problems.

**Solutions**:
1. Check Vercel deployment logs
2. Verify environment variables are set
3. Check for build errors
4. Verify database connections work

## Monitoring & Diagnostics

### Check System Health
- **Sales API**: `/api/sales?lat=38.2527&lng=-85.7585&distanceKm=25`
- **Categories**: `/check-categories`
- **ZIP Codes**: `/test-zipcodes`
- **Health Check**: `/api/health`

### Common Log Messages
- `[SALES]` - Sales API operations
- `[MAP]` - Map updates and markers fetch
- `[VISIBLE]` - Visible pins count
- `[LIST]` - List updates and rendered counts
- `[DROP]` - Dropped network responses (stale/wide)
- `[ZIPSEED]` - ZIP code database operations
- `[SALES][ERROR]` - Sales API errors
- `[SALES][ERROR][BOUNDING_BOX]` - Fallback mode errors

### Performance Monitoring
- Check server response times
- Monitor database query performance
- Watch for memory usage spikes
- Track API error rates

## Getting Help

If you encounter issues not covered here:

1. **Check the logs** - Server and browser console
2. **Use diagnostic tools** - Built-in health check pages
3. **Verify configuration** - Environment variables
4. **Test with known data** - Use seed data for testing
5. **Check documentation** - Category management, ZIP codes, etc.

## Prevention

To avoid common issues:

1. **Regular monitoring** - Use health check endpoints
2. **Proper configuration** - Set all required environment variables
3. **Database maintenance** - Keep indexes updated
4. **Error handling** - Implement proper fallbacks
5. **Testing** - Use diagnostic tools regularly
