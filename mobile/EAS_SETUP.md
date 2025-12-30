# EAS Setup for LootAura Mobile

This document describes the EAS setup process for building Android App Bundles (AAB) for Google Play.

## Prerequisites

- Node.js 20+ installed and in PATH
- Expo account (already logged in)
- EAS CLI installed: `npm install -g eas-cli`

## Setup Steps

### 1. Initialize EAS Project

Run the setup script:

**Windows (PowerShell):**
```powershell
cd mobile
.\setup-eas.ps1
```

**Linux/Mac:**
```bash
cd mobile
chmod +x setup-eas.sh
./setup-eas.sh
```

**Manual initialization:**
```bash
cd mobile
eas init --id
```

This will:
- Generate a unique EAS projectId
- Update `app.json` with the projectId
- Link the project to your Expo account

### 2. Verify Configuration

After initialization, verify `app.json` has been updated:
```json
{
  "extra": {
    "eas": {
      "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  }
}
```

### 3. Android Signing

EAS-managed signing is automatically used when no credentials are specified in `eas.json`. The current configuration uses EAS-managed signing by default (no manual keystores required).

### 4. Build Android AAB

Build the production Android App Bundle:

```bash
cd mobile
eas build --platform android --profile production
```

This will:
- Create a signed AAB file
- Upload it to EAS servers
- Provide a download URL and build ID

### 5. Build Status

Monitor build progress:
```bash
eas build:list --platform android --limit 1
```

View specific build:
```bash
eas build:view [BUILD_ID]
```

## Configuration Files

### `eas.json`
- **Production profile**: Configured for AAB builds (`buildType: "aab"`)
- **Distribution**: Set to `"store"` for Google Play
- **Signing**: EAS-managed (automatic)

### `app.json`
- **Android package**: `com.lootaura.app`
- **EAS projectId**: Will be populated after `eas init`

## Build Artifacts

After a successful build:
- **Build ID**: Unique identifier for the build
- **AAB file**: Available for download from EAS dashboard
- **Signed**: Automatically signed with EAS-managed credentials

## Google Play Upload

The generated AAB can be uploaded to Google Play Console:
1. Go to Google Play Console
2. Navigate to Internal Testing track
3. Create new release
4. Upload the AAB file downloaded from EAS

## Troubleshooting

### EAS CLI not found
```bash
npm install -g eas-cli
```

### Not logged in
```bash
eas login
```

### Build fails
- Check EAS dashboard for detailed logs
- Verify `eas.json` configuration
- Ensure Android package name matches Google Play app

## Notes

- **iOS builds are NOT configured** - Only Android is set up
- **EAS-managed signing** - No manual keystore management required
- **Production builds** - Use `--profile production` for store-ready builds
