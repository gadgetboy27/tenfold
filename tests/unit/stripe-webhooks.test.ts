import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/**
 * Stripe is the only path that moves real money into the credit ledger, and it
 * had no coverage. These pin: which price grants how many credits, that every
 * grant carries an idempotency key (Stripe replays events), that an add-on
 * subscription never clobbers the workspace's tier row (and vice versa), and
 * that an unrecognised price can never downgrade a workspace to payg.
 */

const rpc = vi.fn();
const subRetrieve = vi.fn();
const constructEvent = vi.fn();

interface Call {
  table: string;
  op: "upsert" | "update";
  values: Record<string, unknown>;
  opts?: unknown;
  filters: Array<[string, unknown]>;
}
let calls: Call[] = [];
let subscriptionRow: unknown = null;

function from(table: string) {
  return {
    upsert(values: Record<string, unknown>, opts?: unknown) {
      calls.push({ table, op: "upsert", values, opts, filters: [] });
      return Promise.resolve({ error: null });
    },
    update(values: Record<string, unknown>) {
      const call: Call = { table, op: "update", values, filters: [] };
      calls.push(call);
      return {
        eq(col: string, val: unknown) {
          call.filters.push([col, val]);
          return Promise.resolve({ error: null });
        },
      };
    },
    select() {
      return {
        eq: () => ({
          single: () => Promise.resolve({ data: subscriptionRow }),
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc, from }),
}));

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    subscriptions: { retrieve: subRetrieve },
    webhooks: { constructEvent },
  },
}));

const PRICES = {
  STRIPE_PRICE_25CR: "price_25",
  STRIPE_PRICE_100CR: "price_100",
  STRIPE_PRICE_300CR: "price_300",
  STRIPE_PRICE_CREATOR_MONTHLY: "price_creator",
  STRIPE_PRICE_BUSINESS_MONTHLY: "price_business",
  STRIPE_PRICE_AGENCY_MONTHLY: "price_agency",
  STRIPE_PRICE_BLEND_ADDON: "price_blend",
} as const;

async function load() {
  // The add-on price id is read from env at import time, so env goes first.
  vi.resetModules();
  for (const [k, v] of Object.entries(PRICES)) vi.stubEnv(k, v);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  return import("@/lib/stripe/webhooks");
}

const ev = (type: string, object: unknown) =>
  ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

const checkout = (over: Record<string, unknown>) =>
  ev("checkout.session.completed", {
    metadata: { workspaceId: "ws-1", priceId: "price_100" },
    mode: "payment",
    payment_intent: "pi_1",
    ...over,
  });

const subscription = (
  priceId: string | undefined,
  over: Record<string, unknown> = {},
) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  items: {
    data: [
      priceId
        ? {
            price: { id: priceId },
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
          }
        : {},
    ],
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  calls = [];
  subscriptionRow = null;
  rpc.mockResolvedValue({ error: null });
});

describe("verifyStripeWebhook", () => {
  it("verifies against the raw body, the signature and the configured secret", async () => {
    const { verifyStripeWebhook } = await load();
    constructEvent.mockReturnValue({ id: "evt_ok" });
    expect(verifyStripeWebhook('{"a":1}', "t=1,v1=abc")).toEqual({
      id: "evt_ok",
    });
    expect(constructEvent).toHaveBeenCalledWith(
      '{"a":1}',
      "t=1,v1=abc",
      "whsec_test",
    );
  });

  it("lets a bad signature throw so the route can answer 400", async () => {
    const { verifyStripeWebhook } = await load();
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    expect(() => verifyStripeWebhook("{}", "bad")).toThrow(/signature/i);
  });
});

describe("checkout.session.completed — credit packs", () => {
  it.each([
    ["price_25", 25],
    ["price_100", 100],
    ["price_300", 300],
  ])(
    "%s grants %i credits keyed on the payment intent",
    async (priceId, credits) => {
      const { handleStripeEvent } = await load();
      await handleStripeEvent(
        checkout({ metadata: { workspaceId: "ws-1", priceId } }),
      );
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("grant_credits", {
        p_workspace_id: "ws-1",
        p_amount: credits,
        p_description: "Credit pack purchase",
        p_idempotency_key: "pi_1",
      });
    },
  );

  it("replaying the same event sends the same idempotency key both times", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(checkout({}));
    await handleStripeEvent(checkout({}));
    const keys = rpc.mock.calls.map((c) => c[1].p_idempotency_key);
    expect(keys).toEqual(["pi_1", "pi_1"]);
  });

  it("grants nothing for an unrecognised pack price", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      checkout({ metadata: { workspaceId: "ws-1", priceId: "price_unknown" } }),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing when metadata is missing the workspace or price", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(checkout({ metadata: { priceId: "price_100" } }));
    await handleStripeEvent(checkout({ metadata: { workspaceId: "ws-1" } }));
    await handleStripeEvent(checkout({ metadata: undefined }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when the grant RPC fails, so the route answers non-200 and Stripe retries", async () => {
    const { handleStripeEvent } = await load();
    rpc.mockResolvedValue({ error: { message: "db down" } });
    await expect(handleStripeEvent(checkout({}))).rejects.toThrow(
      /grant_credits failed: db down/,
    );
  });
});

describe("checkout.session.completed — add-ons", () => {
  const addonCheckout = (over: Record<string, unknown> = {}) =>
    checkout({
      mode: "subscription",
      metadata: { workspaceId: "ws-1", priceId: "price_blend" },
      subscription: "sub_addon",
      customer: "cus_1",
      ...over,
    });

  it("upserts an active workspace_addons row, and grants no credits", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(addonCheckout());
    expect(rpc).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        table: "workspace_addons",
        op: "upsert",
        values: {
          workspace_id: "ws-1",
          addon_key: "blend_package",
          status: "active",
          stripe_subscription_id: "sub_addon",
          stripe_customer_id: "cus_1",
        },
        opts: { onConflict: "workspace_id,addon_key" },
        filters: [],
      },
    ]);
  });

  it("accepts expanded subscription/customer objects as well as ids", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      addonCheckout({
        subscription: { id: "sub_x" },
        customer: { id: "cus_x" },
      }),
    );
    expect(calls[0].values).toMatchObject({
      stripe_subscription_id: "sub_x",
      stripe_customer_id: "cus_x",
    });
  });

  it("ignores a tier-upgrade checkout — customer.subscription.* handles that", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      addonCheckout({
        metadata: { workspaceId: "ws-1", priceId: "price_creator" },
      }),
    );
    expect(calls).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("writes nothing when the session carries no subscription id", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(addonCheckout({ subscription: null }));
    expect(calls).toEqual([]);
  });
});

describe("invoice.payment_succeeded — renewals", () => {
  const invoice = (over: Record<string, unknown> = {}) =>
    ev("invoice.payment_succeeded", {
      id: "in_1",
      customer: "cus_1",
      billing_reason: "subscription_cycle",
      ...over,
    });

  beforeEach(() => {
    subscriptionRow = { workspace_id: "ws-1", stripe_subscription_id: "sub_1" };
  });

  it.each([
    ["price_creator", 350],
    ["price_business", 1000],
    ["price_agency", 3000],
  ])(
    "%s renews with %i credits, keyed on the invoice id",
    async (priceId, credits) => {
      const { handleStripeEvent } = await load();
      subRetrieve.mockResolvedValue({
        items: { data: [{ price: { id: priceId } }] },
      });
      await handleStripeEvent(invoice());
      expect(subRetrieve).toHaveBeenCalledWith("sub_1");
      expect(rpc).toHaveBeenCalledWith("grant_credits", {
        p_workspace_id: "ws-1",
        p_amount: credits,
        p_description: "Monthly subscription credits",
        p_idempotency_key: "in_1",
      });
    },
  );

  it("skips manual invoices without touching the DB or Stripe", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(invoice({ billing_reason: "manual" }));
    expect(subRetrieve).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing for a customer with no subscription row", async () => {
    const { handleStripeEvent } = await load();
    subscriptionRow = null;
    await handleStripeEvent(invoice());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing when the row has no stripe_subscription_id yet", async () => {
    const { handleStripeEvent } = await load();
    subscriptionRow = { workspace_id: "ws-1", stripe_subscription_id: null };
    await handleStripeEvent(invoice());
    expect(subRetrieve).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing when the invoice has no customer", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(invoice({ customer: null }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing for an unrecognised subscription price", async () => {
    const { handleStripeEvent } = await load();
    subRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_other" } }] },
    });
    await handleStripeEvent(invoice());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants nothing for an add-on subscription renewal", async () => {
    const { handleStripeEvent } = await load();
    subRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_blend" } }] },
    });
    await handleStripeEvent(invoice());
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.created / updated", () => {
  it.each(["customer.subscription.created", "customer.subscription.updated"])(
    "%s writes tier, status, allowance and period onto the customer's row",
    async (type) => {
      const { handleStripeEvent } = await load();
      await handleStripeEvent(
        ev(type, subscription("price_business", { status: "trialing" })),
      );
      expect(calls).toEqual([
        {
          table: "subscriptions",
          op: "update",
          values: {
            stripe_subscription_id: "sub_1",
            tier: "business",
            status: "trialing",
            credits_per_period: 1000,
            current_period_start: new Date(1_700_000_000 * 1000).toISOString(),
            current_period_end: new Date(1_702_592_000 * 1000).toISOString(),
          },
          filters: [["stripe_customer_id", "cus_1"]],
        },
      ]);
      expect(rpc).not.toHaveBeenCalled(); // credits come from the invoice, not here
    },
  );

  it("accepts an expanded customer object", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      ev(
        "customer.subscription.updated",
        subscription("price_creator", { customer: { id: "cus_obj" } }),
      ),
    );
    expect(calls[0].filters).toEqual([["stripe_customer_id", "cus_obj"]]);
  });

  it("stores null periods rather than Invalid Date when Stripe omits them", async () => {
    const { handleStripeEvent } = await load();
    const sub = subscription("price_creator");
    sub.items.data[0] = { price: { id: "price_creator" } } as never;
    await handleStripeEvent(ev("customer.subscription.updated", sub));
    expect(calls[0].values).toMatchObject({
      current_period_start: null,
      current_period_end: null,
    });
  });

  it("an add-on subscription updates workspace_addons by subscription id and never the tier row", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      ev(
        "customer.subscription.updated",
        subscription("price_blend", { status: "past_due" }),
      ),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "workspace_addons",
      values: { status: "past_due" },
      filters: [["stripe_subscription_id", "sub_1"]],
    });
    expect(calls.some((c) => c.table === "subscriptions")).toBe(false);
  });

  it("an unrecognised price never touches subscriptions (no silent downgrade to payg)", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      ev("customer.subscription.updated", subscription("price_mystery")),
    );
    await handleStripeEvent(
      ev("customer.subscription.updated", subscription(undefined)),
    );
    expect(calls).toEqual([]);
  });
});

describe("customer.subscription.deleted", () => {
  it("drops a tier subscription back to payg with no allowance", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      ev("customer.subscription.deleted", subscription("price_agency")),
    );
    expect(calls).toEqual([
      {
        table: "subscriptions",
        op: "update",
        values: { tier: "payg", status: "canceled", credits_per_period: 0 },
        filters: [["stripe_customer_id", "cus_1"]],
      },
    ]);
  });

  it("cancelling an add-on leaves the workspace's tier untouched", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(
      ev("customer.subscription.deleted", subscription("price_blend")),
    );
    expect(calls).toEqual([
      {
        table: "workspace_addons",
        op: "update",
        values: { status: "canceled" },
        filters: [["stripe_subscription_id", "sub_1"]],
      },
    ]);
  });
});

describe("event types we do not handle", () => {
  it("is a no-op", async () => {
    const { handleStripeEvent } = await load();
    await handleStripeEvent(ev("customer.created", { id: "cus_1" }));
    expect(calls).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
