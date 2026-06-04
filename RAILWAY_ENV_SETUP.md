# Railway Environment Variables Setup

**Project ID:** 9ce19cd2-4cb2-41fd-9850-99fe3c6b2302

---

## ✅ READY TO SET (12 Variables)

All variables are configured in code. Add actual values to Railway Dashboard → Environment:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
FAL_API_KEY
ANTHROPIC_API_KEY
AYRSHARE_API_KEY
RESEND_API_KEY
CRON_SECRET
META_APP_ID
META_APP_SECRET
GOOGLE_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
```

---

## ⏳ PENDING (Get from Supabase + Stripe Later)

### Supabase Database URL
**Where to find:**
1. Go to https://app.supabase.com/project/gbccfqpmoteicpumhkuj
2. Click **Settings** → **Database** → **Connection pooling**
3. Copy the **Transaction pooler** connection string (port 6543)
4. Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

```
DATABASE_URL=postgresql://postgres.gbccfqpmoteicpumhkuj:[PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
```

---

## ❌ STRIPE VARIABLES (Add When Ready)

### Credit Pack Prices
```
STRIPE_PRICE_25CR=price_XXXXX
STRIPE_PRICE_100CR=price_XXXXX
STRIPE_PRICE_300CR=price_XXXXX
```

### Subscription Plan Prices
```
STRIPE_PRICE_CREATOR_MONTHLY=price_XXXXX
STRIPE_PRICE_BUSINESS_MONTHLY=price_XXXXX
STRIPE_PRICE_AGENCY_MONTHLY=price_XXXXX
```

### Stripe API Keys & Secrets
```
STRIPE_SECRET_KEY=sk_live_XXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXX
```

**Where to find:**
- Keys: https://dashboard.stripe.com/apikeys
- Webhook Secret: https://dashboard.stripe.com/webhooks (create endpoint for tenfold)
- Price IDs: https://dashboard.stripe.com/products

---

## 🔧 Optional (Nice to Have)

```
META_APP_ID=[PASTE_YOUR_META_APP_ID]
META_APP_SECRET=[PASTE_YOUR_META_SECRET]
GOOGLE_API_KEY=[PASTE_YOUR_GOOGLE_API_KEY]
GOOGLE_OAUTH_CLIENT_ID=[PASTE_YOUR_GOOGLE_CLIENT_ID]
GOOGLE_OAUTH_CLIENT_SECRET=[PASTE_YOUR_GOOGLE_CLIENT_SECRET]
```

---

## 📋 Railway Setup Instructions

1. **Get Database URL from Supabase** (Settings → Database → Connection pooling → Transaction pooler)
2. **Go to Railway Dashboard** → Your "tenfold" project
3. **Click "Environment"** tab
4. **Paste all variables from "✅ READY" section above**
5. **Come back with DATABASE_URL and Stripe variables when ready**

---

## ✅ Database Tables Status

| Table | Rows | RLS | Status |
|-------|------|-----|--------|
| workspaces | 3 | ✅ | ✅ Ready |
| workspace_members | 3 | ✅ | ✅ Ready |
| credit_accounts | 3 | ✅ | ✅ Ready |
| credit_transactions | 81 | ✅ | ✅ Ready |
| campaigns | 3 | ✅ | ✅ Ready |
| creative_jobs | 21 | ✅ | ✅ Ready |
| assets | 33 | ✅ | ✅ Ready |
| compositions | 11 | ✅ | ✅ Ready |
| social_profiles | 1 | ✅ | ✅ Ready |
| brand_kits | 1 | ✅ | ✅ Ready |
| webhook_logs | 19 | ✅ | ✅ Ready |

**All 34 tables present. RLS enabled on all. Migrations applied.**

---

## 🚀 Once DATABASE_URL is Added

1. Railway will build and deploy automatically
2. Your domain will be: `https://tenfold-production-xxxxx.up.railway.app`
3. Update `APP_URL` and `NEXT_PUBLIC_APP_URL` to your Railway domain
4. Test campaign creation → should work now ✅

---

## 🎯 Summary

- **Ready now:** 8 critical API keys ✅
- **Pending:** 1 database URL (from Supabase)
- **Later:** 9 Stripe variables
- **Database:** All tables set up and healthy ✅
- **Next:** Get DATABASE_URL, add to Railway, deploy
