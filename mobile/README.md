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

