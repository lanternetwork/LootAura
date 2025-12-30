#!/bin/bash
# EAS Setup Script for LootAura Mobile
# This script initializes EAS project and prepares for Android builds

set -e

echo "🚀 Setting up EAS for LootAura Mobile"
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
  echo "❌ EAS CLI not found. Installing..."
  npm install -g eas-cli
fi

echo "✅ EAS CLI version:"
eas --version
echo ""

# Check if logged in
echo "🔐 Checking Expo account status..."
if ! eas whoami &> /dev/null; then
  echo "⚠️  Not logged in to Expo. Please log in:"
  echo "   eas login"
  exit 1
fi

echo "✅ Logged in as: $(eas whoami)"
echo ""

# Initialize EAS project (this will generate projectId)
echo "📦 Initializing EAS project..."
eas init --id

# The init command will update app.json with the projectId
echo ""
echo "✅ EAS project initialized!"
echo ""
echo "📋 Next steps:"
echo "   1. Verify app.json has been updated with projectId"
echo "   2. Build Android AAB: eas build --platform android --profile production"
echo ""
