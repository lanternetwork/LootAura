#!/bin/bash
# Script to manually trigger the archive system cron job

# Set these variables
DOMAIN="${1:-http://localhost:3000}"  # Default to localhost, or pass as first argument
CRON_SECRET="${CRON_SECRET:-}"  # Get from environment or set here

if [ -z "$CRON_SECRET" ]; then
  echo "❌ Error: CRON_SECRET environment variable not set"
  echo "Usage: CRON_SECRET=your-secret ./run-archive-cron.sh [domain]"
  echo "Example: CRON_SECRET=my-secret ./run-archive-cron.sh https://lootaura.vercel.app"
  exit 1
fi

echo "🚀 Triggering archive cron job at $DOMAIN/api/cron/daily"
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "$DOMAIN/api/cron/daily" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_code" = "200" ]; then
  echo ""
  echo "✅ Success! Check the response above for archive results."
else
  echo ""
  echo "❌ Failed with status $http_code"
fi




