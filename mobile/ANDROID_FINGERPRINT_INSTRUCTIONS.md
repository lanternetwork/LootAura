# How to Retrieve Android SHA-256 Fingerprint for App Links

## Method 1: Using EAS CLI (Recommended)

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```

3. **Navigate to mobile directory**:
   ```bash
   cd mobile
   ```

4. **View Android credentials**:
   ```bash
   eas credentials -p android
   ```

5. **Select the build profile**:
   - Choose `production` for production builds
   - Choose `preview` for preview builds
   - Choose `development` for development builds

6. **View keystore information**:
   - Select "View credentials" or "View keystore"
   - Look for "SHA-256 certificate fingerprint" or "SHA256"
   - Copy the fingerprint (format: `XX:XX:XX:XX:...`)

7. **Update assetlinks.json**:
   - Open `public/.well-known/assetlinks.json`
   - Replace `REPLACE_WITH_EAS_PRODUCTION_KEYSTORE_SHA256_FINGERPRINT` with the actual fingerprint
   - Remove colons from the fingerprint (Android App Links expects no colons)
   - Example: `A1:B2:C3:D4:...` becomes `A1B2C3D4...`

## Method 2: From Google Play Console

If your app is already published or has been uploaded to Play Console:

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app
3. Navigate to **Setup** → **App signing**
4. Find **App signing key certificate**
5. Copy the **SHA-256 certificate fingerprint**
6. Remove colons from the fingerprint
7. Update `assetlinks.json`

## Method 3: From APK/AAB File

If you have an existing APK or AAB file:

```bash
# For APK
keytool -printcert -jarfile your-app.apk | grep "SHA256:"

# For AAB (extract first, then check)
# AAB files are signed differently, so use Method 1 or 2
```

## Fingerprint Format

Android App Links requires the SHA-256 fingerprint **without colons**:
- ❌ Wrong: `A1:B2:C3:D4:E5:F6:...`
- ✅ Correct: `A1B2C3D4E5F6...`

## Verification

After updating `assetlinks.json`:

1. Deploy the file to `https://lootaura.com/.well-known/assetlinks.json`
2. Verify it's accessible and returns `Content-Type: application/json`
3. Test App Links on a real Android device
4. Use Android's verification tool:
   ```bash
   adb shell pm verify-app-links --re-verify com.lootaura.app
   ```

## Notes

- The fingerprint must match the signing certificate used for the build you're installing
- For production App Links, use the **production** profile fingerprint
- For testing, you can use the **preview** profile fingerprint
- The fingerprint is case-insensitive but typically shown in uppercase
