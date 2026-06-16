// READ-ONLY price-drift guard. Verifies the live Stripe prices referenced by the
// env match the canonical amounts the billing UI advertises — catches the class
// of bug where displayed price and actual Stripe charge silently diverge.
// Run: npx dotenv -e .env -- npx tsx scripts/inspect-stripe-prices.ts
//
// Canonical amounts (NZD) — keep in sync with app/api/billing/route.ts PLANS/PACKS:
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const TARGETS = [
  { label: "25cr pack", expectNzd: 15, env: "STRIPE_PRICE_25CR" },
  { label: "100cr pack", expectNzd: 49, env: "STRIPE_PRICE_100CR" },
  { label: "300cr pack", expectNzd: 119, env: "STRIPE_PRICE_300CR" },
  { label: "Creator", expectNzd: 29, env: "STRIPE_PRICE_CREATOR_MONTHLY" },
  { label: "Business", expectNzd: 79, env: "STRIPE_PRICE_BUSINESS_MONTHLY" },
  { label: "Agency", expectNzd: 249, env: "STRIPE_PRICE_AGENCY_MONTHLY" },
];

async function main() {
  console.log(
    `Stripe key mode: ${process.env.STRIPE_SECRET_KEY!.startsWith("rk_live") || process.env.STRIPE_SECRET_KEY!.startsWith("sk_live") ? "LIVE" : "TEST"}`,
  );
  console.log("── Current env-referenced subscription prices ──");
  for (const t of TARGETS) {
    const id = process.env[t.env];
    if (!id) {
      console.log(`${t.label}: ${t.env} NOT SET`);
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(id, { expand: ["product"] });
      const product = price.product as Stripe.Product;
      const amount = (price.unit_amount ?? 0) / 100;
      const match =
        amount === t.expectNzd
          ? "✓ matches canonical"
          : `✗ MISMATCH (canonical $${t.expectNzd})`;
      console.log(
        `${t.label}: ${id}\n  product="${product.name}" (${product.id}) amount=$${amount} ${price.currency?.toUpperCase()} ` +
          `${price.recurring?.interval ?? "one-off"} active=${price.active} ${match}`,
      );
    } catch (err) {
      console.log(`${t.label}: ${id} -> ERROR ${(err as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
