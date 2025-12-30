# EAS Setup Script for LootAura Mobile (PowerShell)
# This script initializes EAS project and prepares for Android builds

$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up EAS for LootAura Mobile" -ForegroundColor Cyan
Write-Host ""

# Check if EAS CLI is installed
try {
    $easVersion = eas --version 2>&1
    Write-Host "✅ EAS CLI version: $easVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ EAS CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g eas-cli
}

Write-Host ""

# Check if logged in
Write-Host "🔐 Checking Expo account status..." -ForegroundColor Cyan
try {
    $whoami = eas whoami 2>&1
    Write-Host "✅ Logged in as: $whoami" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Not logged in to Expo. Please log in:" -ForegroundColor Yellow
    Write-Host "   eas login" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Initialize EAS project (this will generate projectId)
Write-Host "📦 Initializing EAS project..." -ForegroundColor Cyan
eas init --id

# The init command will update app.json with the projectId
Write-Host ""
Write-Host "✅ EAS project initialized!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Verify app.json has been updated with projectId"
Write-Host "   2. Build Android AAB: eas build --platform android --profile production"
Write-Host ""
