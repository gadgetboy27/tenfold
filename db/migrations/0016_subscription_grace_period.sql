-- Grace period for failed subscription payments.
--
-- Without this, a failed payment is an INSTANT downgrade: Stripe marks the
-- subscription past_due, customer.subscription.updated writes that status, and
-- getEntitlements() honours only active/trialing — so an expired card drops a
-- paying customer to the free tier mid-sentence, losing video and their tier's
-- limits before they have any chance to update it.
--
-- Nullable and additive: existing rows keep working untouched, and a null
-- grace_until simply means "no grace outstanding".
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

COMMENT ON COLUMN subscriptions.grace_until IS
  'While status is past_due, entitlements are honoured until this moment. Set on invoice.payment_failed, cleared on invoice.payment_succeeded.';

-- Finding whose grace has lapsed shouldn't scan the table.
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_until
  ON subscriptions (grace_until)
  WHERE grace_until IS NOT NULL;
