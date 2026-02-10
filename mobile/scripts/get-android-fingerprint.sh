#!/bin/bash
# Script to retrieve Android SHA-256 fingerprint from EAS credentials
# Usage: ./get-android-fingerprint.sh [profile]
# Profile options: production, preview, development (default: production)

PROFILE=${1:-production}

echo "Retrieving Android SHA-256 fingerprint for profile: $PROFILE"
echo ""
echo "Running: eas credentials -p android"
echo ""

# Run EAS credentials command
eas credentials -p android

echo ""
echo "Instructions:"
echo "1. Select the '$PROFILE' build profile when prompted"
echo "2. Choose 'View credentials' or 'View keystore'"
echo "3. Look for 'SHA-256 certificate fingerprint' or 'SHA256'"
echo "4. Copy the fingerprint (format: XX:XX:XX:XX:...) and update assetlinks.json"
echo ""
echo "Alternative: Get from Google Play Console"
echo "1. Go to Play Console → Your App → Setup → App signing"
echo "2. Find 'App signing key certificate' → SHA-256 certificate fingerprint"
