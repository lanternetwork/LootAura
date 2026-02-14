# Icon Files

This directory contains PWA and native app icons.

## Required Icon Files

### PWA Icons

- **icon-192.png** (192×192) - Standard PWA icon
- **icon-512.png** (512×512) - Standard PWA icon
- **icon-maskable-192.png** (192×192) - Maskable icon for Android (logo within 70-80% of canvas)
- **icon-maskable-512.png** (512×512) - Maskable icon for Android (logo within 70-80% of canvas)
- **apple-touch-icon.png** (180×180) - Apple touch icon for iOS home screen
- **icon.svg** - Vector icon (optional, for any size)

### Icon Requirements

**Safe Padding:**
- Logo should occupy 70-80% of the canvas
- Leave 10-15% padding on all sides
- This prevents "zoomed" appearance on home screens

**Maskable Icons (Android):**
- Logo must be centered
- Safe zone: 80% of canvas (logo should not extend beyond this)
- Background color: #3A2268 (brand purple)
- Foreground: Logo with transparent background

**Apple Touch Icon:**
- Size: 180×180 pixels
- Format: PNG with transparency
- Logo centered with safe padding

## Generation Instructions

1. Start with the logo file (`public/images/logo.png` or `logo-white.png`)
2. Create icons with 70-80% logo size (e.g., for 192×192, logo should be ~134-154px)
3. Center the logo with equal padding on all sides
4. For maskable icons, ensure logo stays within 80% safe zone
5. Use background color #3A2268 for maskable icons
