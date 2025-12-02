# LootAura Mobile App

React Native mobile app built with Expo that wraps the LootAura web application in a WebView.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios
```

## Documentation

See [docs/mobile_apps.md](../../docs/mobile_apps.md) for complete documentation including:
- Architecture overview
- Configuration details
- Testing instructions
- Future enhancements

## Project Structure

```
mobile/
├── app/              # Expo Router app directory
│   ├── _layout.tsx   # Root layout with SafeAreaProvider
│   └── index.tsx     # Main screen with WebView
├── assets/           # App icons, splash screen, etc.
├── app.json          # Expo configuration
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── babel.config.js   # Babel configuration
```

## Requirements

- Node.js 20+
- Expo CLI (or use npx)
- For iOS: Xcode (macOS only)
- For Android: Android Studio

## Assets Needed

The following assets are required in `assets/`:
- `icon.png` (1024x1024) - App icon
- `adaptive-icon.png` (1024x1024) - Android adaptive icon
- `splash.png` (1242x2436) - Splash screen
- `favicon.png` (48x48) - Web favicon

See [docs/mobile_apps.md](../../docs/mobile_apps.md) for details on generating these assets.

## EAS Build & Submit

This project is configured with Expo Application Services (EAS) for building and submitting to app stores.

### Prerequisites

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```

3. **Initialize EAS Project** (if not already done):
   ```bash
   cd mobile
   eas project:init
   ```
   This will create an EAS project and add the `projectId` to `app.json`. If you already have a project ID, you can run:
   ```bash
   eas project:init --id <your-project-id>
   ```

### Build Profiles

The project includes three build profiles configured in `eas.json`:

- **`development`**: Development client builds for internal testing
- **`preview`**: Preview builds (APK for Android, Simulator builds for iOS) for internal distribution
- **`production`**: Production builds (AAB for Android, App Store builds for iOS) for store submission

### Building

#### Preview Builds

Build preview versions for internal testing:

```bash
# Build for both platforms
npm run eas:preview

# Build for specific platform
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

Preview builds produce:
- **Android**: APK file (for direct installation)
- **iOS**: Simulator build (for testing in iOS Simulator)

#### Production Builds

Build production versions for app store submission:

```bash
# Build for both platforms
npm run eas:prod

# Build for specific platform
eas build --profile production --platform android
eas build --profile production --platform ios
```

Production builds produce:
- **Android**: AAB file (Android App Bundle for Play Store)
- **iOS**: IPA file (for App Store submission)

**Note**: Production builds require:
- Apple Developer account (for iOS)
- Google Play Console account (for Android)
- Proper credentials configured in EAS

### Submitting to App Stores

After building production versions and setting up your Apple/Google accounts in EAS, you can submit directly:

```bash
# Submit to both stores
npm run eas:submit

# Submit to specific platform
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

**Important**: Before submitting:
1. Ensure your Apple Developer and Google Play Console accounts are linked to EAS
2. Configure app store credentials:
   ```bash
   eas credentials
   ```
3. Complete all required app store metadata (screenshots, descriptions, etc.)
4. Test the production build thoroughly before submission

### Build Status

Check build status and download builds:
```bash
eas build:list
```

View build details:
```bash
eas build:view [build-id]
```

### Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [EAS CLI Reference](https://docs.expo.dev/eas-cli/)

