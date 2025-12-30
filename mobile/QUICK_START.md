# Quick Start: EAS Android Build

## Immediate Steps (Run These Commands)

### 1. Navigate to mobile directory
```bash
cd "C:\LootAura\Loot Aura\mobile"
```

### 2. Ensure Node.js is available
```bash
node --version  # Should show v20.x or higher
npm --version
```

### 3. Install EAS CLI (if not installed)
```bash
npm install -g eas-cli
```

### 4. Verify Expo login
```bash
eas whoami
```
If not logged in:
```bash
eas login
```

### 5. Initialize EAS Project
```bash
eas init --id
```
This will:
- Generate a projectId
- Update `app.json` automatically
- Link to your Expo account

### 6. Verify projectId in app.json
Check that `app.json` now has a real projectId (not `<INSERT_EAS_PROJECT_ID>`)

### 7. Build Android AAB
```bash
eas build --platform android --profile production
```

### 8. Monitor Build
```bash
eas build:list --platform android --limit 1
```

## Expected Output

After step 7, you should see:
- Build ID (e.g., `abc123def456`)
- Build URL
- Status updates

After completion:
- Download URL for the AAB file
- Build artifact ready for Google Play upload

## Configuration Status

✅ **eas.json**: Already configured for AAB builds
✅ **Android package**: `com.lootaura.app`
✅ **Signing**: EAS-managed (automatic)
✅ **Build type**: AAB (Android App Bundle)

## Notes

- Builds run on EAS servers (not locally)
- First build may take 10-15 minutes
- AAB file will be automatically signed
- No manual keystore management required
