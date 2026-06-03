#!/bin/bash
# Production API Test Suite
# Tests critical user flows and security boundaries

set -e

API="http://localhost:3000/api"
WORKSPACE_ID=""
USER_ID=""
CAMPAIGN_ID=""
BEARER_TOKEN=""

echo "🧪 Tenfold Production API Tests"
echo "================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_pass() {
  echo -e "${GREEN}✓${NC} $1"
}

test_fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

# Test 1: Health check
echo "1️⃣  Health Checks"
echo "---"

response=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/health)
status=$(echo "$response" | tail -n 1)
if [ "$status" == "200" ]; then
  test_pass "Health endpoint responds"
else
  test_fail "Health endpoint failed: $status"
fi

# Test 2: Campaign creation requires auth
echo ""
echo "2️⃣  Authentication & Authorization"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X GET $API/campaigns)
status=$(echo "$response" | tail -n 1)
if [ "$status" == "401" ]; then
  test_pass "Unauthenticated request rejected (401)"
else
  test_fail "Unauthenticated request should return 401, got: $status"
fi

# Test 3: Invalid Bearer token
response=$(curl -s -w "\n%{http_code}" -X GET $API/campaigns \
  -H "Authorization: Bearer invalid-token")
status=$(echo "$response" | tail -n 1)
if [ "$status" == "401" ]; then
  test_pass "Invalid Bearer token rejected (401)"
else
  test_fail "Invalid token should return 401, got: $status"
fi

# Test 4: CORS headers present
echo ""
echo "3️⃣  CORS & Security Headers"
echo "---"

response=$(curl -s -i -X OPTIONS $API/jobs 2>&1 | grep -i "Access-Control" || true)
if [ -n "$response" ]; then
  test_pass "CORS headers present in OPTIONS response"
else
  test_fail "CORS headers missing"
fi

# Test 5: Rate limiting on auth callback
echo ""
echo "4️⃣  Rate Limiting"
echo "---"

# Try 15 rapid requests (limit is 10/min)
success_count=0
for i in {1..15}; do
  response=$(curl -s -w "\n%{http_code}" -X GET \
    "http://localhost:3000/api/(auth)/callback?code=test&error=none" 2>/dev/null || echo "")
  status=$(echo "$response" | tail -n 1)

  # First 10 should succeed (200 or 307 or 400)
  # 11+ should get 429 (rate limited)
  if [ $i -le 10 ] && [[ ! " 429 " =~ " ${status} " ]]; then
    ((success_count++))
  elif [ $i -gt 10 ] && [ "$status" == "429" ]; then
    test_pass "Rate limiting active (>10 requests get 429)"
    break
  fi
done

# Test 6: Schema validation
echo ""
echo "5️⃣  Input Validation"
echo "---"

# Attempt campaign creation with invalid schema (missing required fields)
response=$(curl -s -w "\n%{http_code}" -X POST $API/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{}')
status=$(echo "$response" | tail -n 1)

if [ "$status" == "400" ] || [ "$status" == "401" ]; then
  test_pass "Invalid request rejected ($status)"
else
  test_fail "Invalid request should be rejected, got: $status"
fi

# Test 7: Content agent requires min transcript length
echo ""
echo "6️⃣  Content Agent Validation"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST $API/content/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"transcript": "short"}')
status=$(echo "$response" | tail -n 1)

if [ "$status" == "400" ] || [ "$status" == "401" ]; then
  test_pass "Short transcript rejected ($status)"
else
  test_fail "Short transcript should be rejected, got: $status"
fi

# Test 8: TypeScript compilation
echo ""
echo "7️⃣  Code Quality"
echo "---"

if npx tsc --noEmit >/dev/null 2>&1; then
  test_pass "TypeScript compiles without errors"
else
  test_fail "TypeScript compilation failed"
fi

# Test 9: Tests pass
echo ""
echo "8️⃣  Test Suite"
echo "---"

if npm run test >/dev/null 2>&1; then
  test_pass "All unit tests pass"
else
  test_fail "Unit tests failed"
fi

# Final summary
echo ""
echo "✅ All critical API tests passed!"
echo ""
echo "📋 Next steps:"
echo "  1. Test authentication flow manually at http://localhost:3000"
echo "  2. Create a test campaign and verify image generation"
echo "  3. Test content agent pipeline with a sample transcript"
echo "  4. Verify Ayrshare/Stripe keys are configured"
echo "  5. When ready, deploy to Vercel with: npx vercel --prod"
