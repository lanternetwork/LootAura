# Native App Icon Requirements

## iOS Icon

**File:** `icon.png`
**Size:** 1024×1024 pixels
**Format:** PNG
**Requirements:**
- Logo should occupy 70-80% of canvas (716-819px for 1024×1024)
- Center the logo with equal padding on all sides
- No transparency (iOS requires opaque background)
- Background color: #3A2268 (brand purple)

## Android Adaptive Icon

**File:** `adaptive-icon.png`
**Size:** 1024×1024 pixels (foreground)
**Format:** PNG with transparency
**Requirements:**
- Logo should occupy 70-80% of canvas (716-819px)
- Center the logo with equal padding
- Safe zone: Logo must stay within 80% of canvas (820px) to avoid clipping
- Transparent background (Android will apply backgroundColor)
- Background color (set in app.json): #3A2268

**Safe Zone Guidelines:**
- Keep logo centered
- Ensure no important content extends beyond 80% of canvas
- Android will apply various mask shapes, so padding is critical

## Splash Screen

**File:** `splash.png`
**Size:** 2048×2048 pixels (or larger)
**Format:** PNG
**Background Color:** #3A2268 (matches app.json splash.backgroundColor)
