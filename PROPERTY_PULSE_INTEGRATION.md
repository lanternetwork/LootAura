# Property Pulse Integration

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

This branch integrates the Property Pulse Next.js template while preserving the existing LootAura functionality.

## Isolation Policy and Compatibility Mode

### Sandboxed Integration
- **Isolation**: Property Pulse components run in isolated namespace
- **No Conflicts**: Existing LootAura functionality remains unchanged
- **Compatibility**: Both systems can coexist without interference
- **Future Merge**: Integration plan documented for enterprise structure

### External Template Registration
- **Integration Rules**: All external templates must register through `docs/operating-handbook.md`
- **Approval Process**: Template integration requires enterprise standards compliance
- **Documentation**: Integration patterns documented for future templates
- **Testing**: Comprehensive testing required for all integrations

## Structure

### Property Pulse Files
- `app-property-pulse/` - Property Pulse app directory
- `components-property-pulse/` - Property Pulse components
- `config-property-pulse/` - Property Pulse configuration
- `context-property-pulse/` - Property Pulse context providers
- `models-property-pulse/` - Property Pulse data models
- `utils-property-pulse/` - Property Pulse utilities

### Preserved Assets
- `/public/brand/` - Preserved for existing branding assets
- Existing app structure in `app/` directory
- Existing components in `components/` directory

## Dependencies Added

### Property Pulse Dependencies
- `cloudinary` - Image upload and management
- `mapbox-gl` - Map functionality
- `mongodb` - Database
- `mongoose` - MongoDB ODM
- `next-auth` - Authentication
- `photoswipe` - Image gallery
- `react-geocode` - Geocoding
- `react-icons` - Icon library
- `react-map-gl` - React map components
- `react-photoswipe-gallery` - Photo gallery
- `react-share` - Social sharing
- `react-spinners` - Loading spinners
- `react-toastify` - Toast notifications

## Node.js Version
- Enforced Node 20 via `.nvmrc` and `package.json.engines`

## Tailwind Configuration
- Updated to include Property Pulse components
- Added Poppins font family
- Added custom grid template columns

## Next Steps
1. Install dependencies: `npm install`
2. Configure environment variables for Property Pulse
3. Set up MongoDB connection
4. Configure Cloudinary for image uploads
5. Set up Mapbox API key
6. Test Property Pulse functionality

## Legacy Code
- Existing Yard Sale Tracker code paths are preserved
- No modifications to legacy functionality
- Property Pulse runs alongside existing app
