# Database Migrations

## Current State

**Schema source of truth:** `db/schema.ts` (Drizzle ORM)

**Migration tracking:** Mixed approach:
- `0000_init_schema.sql` — registered in `meta/_journal.json` (Drizzle-tracked)
- `0001_add_social_oauth_tokens.sql` — raw SQL, applied manually
- `0002_content_agent.sql` — raw SQL, applied manually
- `0003_atomic_credit_debit.sql` — raw SQL, applied manually
- `0004_add_campaigns_name.sql` — raw SQL, applied manually

## Why Mixed?

Early migrations (0001) were created as raw SQL before Drizzle's migration system was properly configured. The schema.ts has since been updated to reflect all columns and tables, but the migrations were never registered with Drizzle's `_journal.json`.

## Running Migrations

### Option A: Production (Recommended)
```bash
# Drizzle migrations (0000 only)
npx drizzle-kit migrate

# Then manually apply raw SQL migrations (0001–0004) in Supabase SQL editor
# Copy paste contents of each file in db/migrations/ into Supabase dashboard
```

### Option B: Local Development
```bash
# Start Supabase local
supabase start

# Apply all migrations (Drizzle will track 0000, raw SQL are manual)
npx drizzle-kit migrate
# Then run raw migrations via supabase CLI or SQL editor
```

## Future Migrations

All new migrations should:
1. Update `db/schema.ts` with the Drizzle schema changes
2. Run `npx drizzle-kit generate` to create the migration
3. Verify it's registered in `meta/_journal.json`

This ensures consistency and allows `npx drizzle-kit migrate` to apply them automatically.

## How to Fix the Journal (Optional)

If you want to backfill the journal with past migrations:

```bash
# Edit meta/_journal.json and add entries for 0001–0004
# Then Drizzle will recognize them as applied
```

But this is not required if you're already applying them separately.
