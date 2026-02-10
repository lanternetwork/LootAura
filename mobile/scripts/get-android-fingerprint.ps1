# PowerShell script to retrieve Android SHA-256 fingerprint from EAS credentials
# Usage: .\get-android-fingerprint.ps1 [profile]
# Profile options: production, preview, development (default: production)

param(
    [string]$Profile = "production"
)

Write-Host "Retrieving Android SHA-256 fingerprint for profile: $Profile" -ForegroundColor Cyan
Write-Host ""
Write-Host "Running: eas credentials -p android" -ForegroundColor Yellow
Write-Host ""

# Run EAS credentials command
eas credentials -p android

Write-Host ""
Write-Host "Instructions:" -ForegroundColor Green
Write-Host "1. Select the '$Profile' build profile when prompted"
Write-Host "2. Choose 'View credentials' or 'View keystore'"
Write-Host "3. Look for 'SHA-256 certificate fingerprint' or 'SHA256'"
Write-Host "4. Copy the fingerprint (format: XX:XX:XX:XX:...) and update assetlinks.json"
Write-Host ""
Write-Host "Alternative: Get from Google Play Console" -ForegroundColor Cyan
Write-Host "1. Go to Play Console → Your App → Setup → App signing"
Write-Host "2. Find 'App signing key certificate' → SHA-256 certificate fingerprint"
