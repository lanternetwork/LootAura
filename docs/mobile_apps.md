# Mobile Apps Documentation

## Overview

The LootAura mobile app is a **React Native application built with Expo** that wraps the LootAura web application (`https://lootaura.com`) in a WebView. This approach allows us to ship Android and iOS apps quickly while maintaining a single codebase for the web application.

### Architecture

- **Framework**: Expo SDK 51 with Expo Router
- **Platform**: React Native (Android & iOS)
- **Web Integration**: `react-native-webview` component loading `https://lootaura.com`
- **Navigation**: Single-screen app with WebView navigation handled internally

### Repository Structure

The mobile app is located at `mobile/` in the repository root. This is a **standalone Expo project** within the monorepo structure.

**Repo Configuration:**
- **Package Manager**: npm (standard npm project, not a monorepo workspace)
- **Mobile App Location**: `mobile/` (standalone directory at root)
- **No workspace configuration needed**: The mobile app is independent and uses its own `package.json`

The web app and mobile app are separate projects that share the same repository but have independent dependency management.

## Getting Started

### Prerequisites

- Node.js 20+ (matches web app requirement)
- npm (or yarn/pnpm)
- Expo CLI (installed globally or via npx)
- For iOS: Xcode and CocoaPods (macOS only)
- For Android: Android Studio and Android SDK

### Installation

1. Navigate to the mobile app directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npm start
   # or
   expo start
   ```

### Running the App

#### Development Server

Start the Expo development server:
```bash
cd mobile
npm start
```

This will:
- Start the Metro bundler
- Open Expo DevTools in your browser
- Display a QR code for testing on physical devices

#### Android

Run on Android emulator or connected device:
```bash
cd mobile
npm run android
# or
expo run:android
```

**Requirements:**
- Android Studio installed
- Android emulator running OR physical device connected via USB with USB debugging enabled

#### iOS

Run on iOS simulator or connected device (macOS only):
```bash
cd mobile
npm run ios
# or
expo run:ios
```

**Requirements:**
- macOS with Xcode installed
- iOS Simulator available OR physical device connected

## App Configuration

### App Metadata

- **Name**: LootAura
- **Slug**: `lootaura`
- **Bundle Identifier (iOS)**: `com.lootaura.app`
- **Package Name (Android)**: `com.lootaura.app`
- **Deep Link Scheme**: `lootaura://`

### Branding

#### Colors

- **Primary Brand Color**: `#3A2268` (used for splash screen background and UI accents)
- **Theme Color**: `#F59E0B` (from web app manifest)

#### Icons & Assets

The app requires the following assets in `mobile/assets/`:

1. **icon.png** (1024x1024 PNG)
   - App icon for iOS and Android
   - Should be based on the existing LootAura logo from `public/brand/sitelogo.svg`
   - TODO: Generate a 1024x1024 PNG version of the logo with transparent background

2. **adaptive-icon.png** (1024x1024 PNG)
   - Android adaptive icon foreground
   - Should match the app icon design
   - TODO: Create Android adaptive icon based on logo

3. **splash.png** (1242x2436 PNG recommended)
   - Splash screen image
   - Background color: `#3A2268`
   - Should display the LootAura logo centered
   - TODO: Create splash screen with logo centered on brand background

4. **favicon.png** (48x48 PNG)
   - Web favicon (for Expo web support)
   - TODO: Generate from existing icon assets

**Current Status**: Placeholder assets directory exists. Icon assets need to be generated from the existing web app logo (`public/brand/sitelogo.svg`).

### Permissions

**Current Permissions (MVP):**
- **Location (iOS)**: Requested with user-friendly description for showing nearby yard sales
- **No other permissions**: The web app handles location via browser APIs, so no native location permission is required for MVP

**Future Permissions (not implemented):**
- Push notifications (for future native notification support)
- Camera (if native photo upload is added later)

## Features

### WebView Integration

The app loads `https://lootaura.com` in a WebView with the following features:

- **Loading State**: Shows a loading spinner with "Loading LootAura..." text while the page loads
- **Error Handling**: Displays a user-friendly error message with retry button if the site can't be reached
- **External Links**: Opens external links (social media, email, maps, etc.) in the system browser instead of the WebView
- **Internal Navigation**: All navigation within `lootaura.com` stays inside the WebView
- **Cookie Support**: Third-party cookies enabled for authentication (Supabase, etc.)

### Android Back Button

The app implements proper Android back button behavior:

- **WebView Navigation**: If the WebView can go back in its history, pressing back navigates back within the WebView
- **App Exit**: If the WebView is at the initial URL (can't go back), pressing back exits the app

### Safe Area Handling

- Uses `react-native-safe-area-context` to handle notches and status bars
- Ensures content is not obscured by device-specific UI elements

### Orientation

- **Locked to Portrait**: Default orientation is portrait-only
- **Future Consideration**: Landscape mode may be enabled later for map views

## Deep Linking

### Current Setup

The app is configured with a deep link scheme: `lootaura://`

### Future Implementation

**Planned Deep Link Support:**

Deep links can be mapped to corresponding URLs inside the WebView. For example:

- `lootaura://sales/:id` → `https://lootaura.com/sales/:id`
- `lootaura://profile/:userId` → `https://lootaura.com/profile/:userId`

**Implementation Approach (Future):**

1. Intercept initial URL / `openURL` events in the native app
2. Parse the deep link path
3. Navigate the WebView to the corresponding `https://lootaura.com` URL via:
   - Injected JavaScript: `webViewRef.current.injectJavaScript('window.location.href = "https://lootaura.com/sales/123"')`
   - Or initial URL parameter: Pass the target URL as a query parameter on first load

**Status**: Deep link scheme is configured, but routing into the WebView is not yet implemented. This is a future enhancement.

## Testing

### Manual Test Checklist

#### Setup

1. Navigate to mobile app directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm start
   ```

#### Android Testing

1. Start Android emulator or connect physical device
2. Run: `npm run android`
3. Verify:
   - ✅ App launches and shows splash screen with brand color (`#3A2268`)
   - ✅ WebView loads `https://lootaura.com` successfully
   - ✅ Loading spinner appears while page loads and disappears after
   - ✅ Error state appears if device is offline, with retry button that works
   - ✅ Tapping sale cards / map pins / navigation links inside LootAura works normally
   - ✅ External links (Google Maps, email links, social media) open in system browser
   - ✅ Android back button navigates back in WebView history, then exits app when at initial page
   - ✅ App name, icon, and splash screen display correctly

#### iOS Testing

1. Start iOS Simulator or connect physical device (macOS only)
2. Run: `npm run ios`
3. Verify:
   - ✅ App launches and shows splash screen with brand color (`#3A2268`)
   - ✅ WebView loads `https://lootaura.com` successfully
   - ✅ Loading spinner appears while page loads and disappears after
   - ✅ Error state appears if device is offline, with retry button that works
   - ✅ Tapping sale cards / map pins / navigation links inside LootAura works normally
   - ✅ External links (Google Maps, email links, social media) open in system browser
   - ✅ App name, icon, and splash screen display correctly

### Platform-Specific Notes

#### iOS

- **WKWebView**: Uses WKWebView (default in React Native WebView)
- **Caching**: WKWebView has aggressive caching; may need cache clearing during development
- **Status Bar**: Configured to use light status bar style for visibility on dark splash screen

#### Android

- **WebView**: Uses Android System WebView
- **Back Button**: Properly handled via React Native BackHandler API
- **Permissions**: No runtime permissions required for MVP (location handled by web app)

## Environment Variables

**No environment variables required for MVP.**

The mobile app only needs the public URL (`https://lootaura.com`), which is hardcoded in the app. Future enhancements (push notifications, analytics, etc.) may require environment variables.

## Future Enhancements

### Planned Features

1. **Deep Linking**: Map `lootaura://` deep links to WebView navigation (see Deep Linking section)
2. **Push Notifications**: Native push notification support via Expo Notifications
3. **Native Modals**: Custom native modals for specific flows (e.g., sale creation confirmation)
4. **Offline Support**: Cache key pages for offline viewing
5. **Native Sharing**: Use React Native Share API for improved sharing experience
6. **Biometric Auth**: Native biometric authentication for faster login
7. **App Store Optimization**: Prepare for Play Store and App Store submission

### Not Planned (Web App Handles)

- Location services (handled by web app via browser APIs)
- Map rendering (handled by web app via Mapbox)
- Authentication (handled by web app via Supabase)
- Data fetching (all API calls handled by web app)

## Build & Deployment

### Development Build

```bash
cd mobile
npm start
```

### Production Build

#### Android (APK/AAB)

```bash
cd mobile
eas build --platform android
```

Requires Expo Application Services (EAS) account setup.

#### iOS (IPA)

```bash
cd mobile
eas build --platform ios
```

Requires:
- Apple Developer account
- EAS account setup
- macOS for local builds (or use EAS cloud builds)

### App Store Submission

**Not yet configured.** Future steps:

1. Set up EAS Build and Submit
2. Configure app store metadata
3. Generate app icons and screenshots
4. Submit to Play Store / App Store

## Troubleshooting

### Common Issues

#### WebView Not Loading

- **Check internet connection**: The app requires internet to load `https://lootaura.com`
- **Check URL**: Verify the URL is correct in `app/index.tsx`
- **Clear cache**: On iOS, WKWebView caches aggressively; may need to clear app data

#### Android Back Button Not Working

- **Verify implementation**: Check that `BackHandler` is properly imported and used
- **Check WebView ref**: Ensure `webViewRef` is properly attached to the WebView component

#### External Links Not Opening

- **Check `onShouldStartLoadWithRequest`**: Verify the logic correctly identifies external URLs
- **Test with different link types**: Some links may need special handling (e.g., app-specific URLs)

### Development Tips

- Use Expo DevTools for debugging: `npm start` opens DevTools automatically
- Enable remote debugging in WebView for web app debugging
- Use React Native Debugger for native debugging
- Check Metro bundler logs for build errors

## Changelog

### Initial Implementation (2025-01-26)

- ✅ Created Expo React Native app structure
- ✅ Implemented WebView wrapper for `https://lootaura.com`
- ✅ Added loading state with spinner
- ✅ Added error state with retry functionality
- ✅ Implemented Android back button handling
- ✅ Configured external link handling (opens in system browser)
- ✅ Set up app configuration (app.json) with branding
- ✅ Added SafeAreaView for proper device UI handling
- ✅ Configured deep link scheme (`lootaura://`) for future use
- ✅ Locked orientation to portrait
- ✅ Added TypeScript configuration
- ✅ Created documentation

**Next Steps:**
- Generate app icons and splash screen assets
- Test on physical devices
- Set up EAS Build for production builds
- Implement deep link routing into WebView

