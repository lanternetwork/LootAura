#!/bin/bash
# Release Hardening Verification Script
# Checks for common regressions in security, RLS, rate limiting, and logging

set -euo pipefail

ERRORS=0
WARNINGS=0

echo "🔍 Running release hardening verification..."

# 1. Check for getAdminDb() or SUPABASE_SERVICE_ROLE in request-path files
echo ""
echo "1️⃣ Checking for service role usage in request-path handlers..."

# Find request-path files, excluding accountLock.ts which uses getAdminDb only as test fallback
REQUEST_PATH_FILES=$(find app/api app/auth middleware lib/auth/server-session.ts -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "accountLock.ts" 2>/dev/null || true)

if [ -z "$REQUEST_PATH_FILES" ]; then
  echo "⚠️  No request-path files found to check"
else
  # Find files with getAdminDb or SUPABASE_SERVICE_ROLE, then filter out comment-only matches
  VIOLATIONS=""
  for file in $REQUEST_PATH_FILES; do
    # Skip accountLock.ts - it uses getAdminDb only as test fallback (allowed)
    if echo "$file" | grep -q "accountLock.ts" || [ $? -ne 0 ]; then
      if echo "$file" | grep -q "accountLock.ts"; then
        continue
      fi
    fi
    
    # Check if file contains the pattern in actual code (not comments)
    # First check if pattern exists at all (use || true to handle no-match)
    if ! (grep -q "getAdminDb\|SUPABASE_SERVICE_ROLE" "$file" 2>/dev/null || false); then
      continue
    fi
    
    # Check if match is in actual code (not just in comments)
    # Remove comment lines and check if pattern still exists in code
    # Match lines that are NOT comments: not starting with //, /*, or * (for block comments)
    if grep -vE "^\s*(//|/\*|\*)" "$file" 2>/dev/null | grep -qE "\b(getAdminDb|SUPABASE_SERVICE_ROLE)\b" 2>/dev/null; then
      if [ -z "$VIOLATIONS" ]; then
        VIOLATIONS="$file"
      else
        VIOLATIONS="$VIOLATIONS"$'\n'"$file"
      fi
    fi
  done
  
  if [ -n "$VIOLATIONS" ]; then
    echo "⚠️  Service role usage found in request-path files (checking context):"
    while IFS= read -r file; do
      # Check if it's in an allowed context (webhook, admin route, cron, job, debug, analytics, geocoding writeback, sale reports, drafts publish)
      # Also allow promotions/intent since it requires service role for INSERT (no RLS INSERT policy exists)
      # Allow analytics/track since analytics_events has no RLS INSERT policy
      # Allow debug routes since they're admin-only
      # Allow geocoding/zip since it only uses admin for optional writeback (ENABLE_ZIP_WRITEBACK)
      # Allow sales/[id]/report since it needs admin to check reports from other users (no SELECT policy) and update moderation status
      # Allow drafts/publish since it needs admin for transactional consistency (create sale + items + delete draft) and rollback operations
      if echo "$file" | grep -qE "(webhook|/admin/|/cron/|/jobs/|health/supabase|promotions/intent|/debug/|analytics/track|geocoding/zip|sales/.*/report|drafts/publish)"; then
        echo "   ✅ $file - Allowed: webhook/admin/cron/job/health/promotions-intent/debug/analytics/geocoding/sale-reports/drafts-publish context"
      elif echo "$file" | grep -qE "(middleware|server-session)"; then
        echo "   ❌ $file - BLOCKER: Service role in middleware/auth session"
        ERRORS=$((ERRORS + 1))
      else
        echo "   ❌ $file - BLOCKER: Service role in request-path handler"
        ERRORS=$((ERRORS + 1))
      fi
    done <<< "$VIOLATIONS"
  else
    echo "✅ No service role usage in request-path handlers"
  fi
fi

# 2. Check for missing rate limiting on required endpoints
echo ""
echo "2️⃣ Checking rate limiting coverage..."

REQUIRED_RATE_LIMITED=(
  "app/api/sales/route.ts:GET"
  "app/api/favorites_v2/route.ts:GET"
  "app/api/profile/update/route.ts:POST"
)

for endpoint in "${REQUIRED_RATE_LIMITED[@]}"; do
  file=$(echo "$endpoint" | cut -d: -f1)
  method=$(echo "$endpoint" | cut -d: -f2)
  
  if [ ! -f "$file" ]; then
    echo "⚠️  File not found: $file"
    WARNINGS=$((WARNINGS + 1))
    continue
  fi
  
  # Check if export is wrapped with withRateLimit (multiple patterns)
  if grep -q "export.*$method.*=.*withRateLimit" "$file"; then
    echo "✅ $file:$method is rate-limited (direct export)"
  elif grep -q "export async function $method" "$file" && grep -A20 "export async function $method" "$file" | grep -q "withRateLimit"; then
    echo "✅ $file:$method is rate-limited (inline wrapper)"
  elif grep -q "async function.*Handler" "$file" && grep -q "withRateLimit.*Handler\|withRateLimit.*$method" "$file"; then
    echo "✅ $file:$method is rate-limited (via handler wrapper)"
  else
    echo "❌ $file:$method is NOT rate-limited"
    ERRORS=$((ERRORS + 1))
  fi
done

# 3. Check OAuth callback logging for sensitive data
echo ""
echo "3️⃣ Checking OAuth callback logging safety..."

OAUTH_CALLBACK_FILES=$(find app/auth -type f -name "*.ts" -path "*/callback/*" 2>/dev/null || true)

if [ -z "$OAUTH_CALLBACK_FILES" ]; then
  echo "⚠️  No OAuth callback files found"
  WARNINGS=$((WARNINGS + 1))
else
  for file in $OAUTH_CALLBACK_FILES; do
    # Check for dangerous logging patterns (only in actual log statements, not assignments)
    # Look for url.href, searchParams.get('code'), or redirectTo in console.log/logger calls
    if grep -qE "(console\.(log|warn|error).*url\.href|logger\.(info|warn|error).*url\.href|console\.(log|warn|error).*searchParams\.get\(['\"]code|logger\.(info|warn|error).*searchParams\.get\(['\"]code|console\.(log|warn|error).*redirectTo|logger\.(info|warn|error).*redirectTo)" "$file" 2>/dev/null; then
      echo "❌ $file: Potentially unsafe logging detected"
      echo "   Check for: url.href, searchParams.get('code'), or redirectTo in logs"
      ERRORS=$((ERRORS + 1))
    else
      echo "✅ $file: No unsafe logging patterns detected"
    fi
  done
fi

# 4. Verify pagination parameters are handled correctly
echo ""
echo "4️⃣ Checking /api/sales pagination implementation..."

if [ -f "app/api/sales/route.ts" ]; then
  # Check for limit/offset parsing
  if grep -qE "(limit.*parseInt|offset.*parseInt|maxLimit|defaultLimit)" "app/api/sales/route.ts"; then
    echo "✅ Pagination parameters (limit/offset) are parsed"
    
    # Check for max limit enforcement
    if grep -qE "Math\.min.*200|maxLimit.*200" "app/api/sales/route.ts"; then
      echo "✅ Max limit (200) is enforced"
    else
      echo "⚠️  Max limit enforcement not clearly visible"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo "❌ Pagination parameters not found in /api/sales"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "⚠️  app/api/sales/route.ts not found"
  WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Release hardening verification FAILED"
  echo "   Fix the errors above before proceeding with release"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo ""
  echo "⚠️  Release hardening verification passed with warnings"
  exit 0
else
  echo ""
  echo "✅ Release hardening verification PASSED"
  exit 0
fi
