# MS-MAP-03: Saved Searches + Share Links + Map UX Polish

This document outlines the implementation of saved search presets, shareable links, and accessibility improvements for the map interface.

## Features

### A) URL State & Deep Links
- **Serialization**: Stable URL encoding of viewport and filter state
- **Deserialization**: Validated state restoration from URLs
- **Compression**: Base64url encoding for shortlink generation
- **State Management**: Automatic URL updates on state changes

### B) Saved Searches (Presets)
- **Local Storage**: Signed-out users can save presets locally
- **Cloud Storage**: Signed-in users can save presets to the cloud
- **Default Presets**: Set and auto-apply default presets
- **CRUD Operations**: Create, read, update, delete presets

### C) Shareable Links
- **Shortlink Generation**: Create `/s/<id>` URLs for sharing
- **State Encoding**: Full map and filter state in shareable URLs
- **Public Access**: No authentication required for shared links
- **TTL Cleanup**: Automatic cleanup of old shared states

### D) Map UX Polish & A11y
- **Keyboard Navigation**: Arrow keys for pan, +/- for zoom
- **Focus Management**: Enter to focus clusters, Escape to clear
- **Screen Reader Support**: Live announcements for map updates
- **Reduced Motion**: Respects user's motion preferences
- **Focus Rings**: Visible focus indicators for interactive elements

## URL Encoding

### Query Parameters
- `lat`, `lng`, `zoom`: Viewport state
- `date`: Date range filter
- `cats`: Comma-separated categories (sorted)
- `radius`: Search radius in miles

### Example URLs
```
/explore?lat=40.7128&lng=-74.0060&zoom=12&date=today&cats=furniture,electronics&radius=50
/s/abc123def → redirects to canonical URL
```

## Privacy & Security

### No PII in URLs
- Only map coordinates and filter preferences
- No user identification or personal data
- No authentication tokens in URLs

### RLS Policies
- Users can only access their own presets
- Shared states are public but anonymous
- No user tracking in shared links

## Feature Flags

### Environment Variables
```bash
NEXT_PUBLIC_FLAG_SAVED_PRESETS=true    # Enable preset menu
NEXT_PUBLIC_FLAG_SHARE_LINKS=true      # Enable share functionality
```

### Rollback Plan
- Set flags to `false` to disable features
- UI components automatically hide when disabled
- No data loss risk (additive migrations only)

## Database Schema

### user_presets Table
```sql
CREATE TABLE user_presets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  state_json JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### shared_states Table
```sql
CREATE TABLE shared_states (
  id TEXT PRIMARY KEY,  -- Short ID
  state_json JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE
);
```

## Accessibility Features

### Keyboard Navigation
- **Arrow Keys**: Pan map in all directions
- **+/- Keys**: Zoom in and out
- **Enter**: Focus nearest cluster
- **Escape**: Clear focus

### Screen Reader Support
- **Live Regions**: Announce map updates
- **ARIA Labels**: Descriptive labels for interactive elements
- **Focus Management**: Clear focus indicators

### Reduced Motion
- Respects `prefers-reduced-motion` CSS media query
- Smooth transitions only when user prefers them

## Testing

### Unit Tests
- URL state serialization/deserialization
- Preset CRUD operations
- Share API endpoints
- Keyboard navigation handlers

### Integration Tests
- Local preset storage
- Cloud preset RLS policies
- Share link generation and retrieval
- Map accessibility features

### A11y Tests
- Keyboard navigation
- Screen reader announcements
- Focus management
- ARIA compliance

## Performance

### Bundle Impact
- Lazy-loaded preset menu component
- Code-split share functionality
- Minimal impact on initial bundle

### Caching
- Local storage for signed-out users
- Cloud storage for signed-in users
- Shared state cleanup after 30 days

## Rollout Plan

### Phase 1: Core Features
1. Deploy with feature flags disabled
2. Enable saved presets for internal testing
3. Enable share links for internal testing

### Phase 2: User Testing
1. Enable for beta users
2. Monitor usage and performance
3. Gather feedback on UX

### Phase 3: Full Rollout
1. Enable for all users
2. Monitor adoption rates
3. Optimize based on usage patterns

## Troubleshooting

### Common Issues
- **Presets not saving**: Check localStorage permissions
- **Share links not working**: Verify database connectivity
- **Keyboard navigation not working**: Check focus management

### Debug Mode
Set `NEXT_PUBLIC_DEBUG=true` for detailed logging of:
- URL state changes
- Preset operations
- Share link generation
- Keyboard events

## Future Enhancements

### Planned Features
- Preset categories/tags
- Preset sharing between users
- Advanced keyboard shortcuts
- Voice navigation support

### Performance Optimizations
- Preset compression
- Lazy loading of preset data
- Background sync for offline presets
