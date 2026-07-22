"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";
import {
  CreditCard,
  Zap,
  CheckCircle2,
  Loader2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Crown,
  Sparkles,
  ExternalLink,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RedeemCode from "@/components/billing/RedeemCode";
import toast from "react-hot-toast";

interface Plan {
  id: string;
  name: string;
  priceNzd: number;
  creditsPerMonth: number;
  priceId: string | null;
  features: string[];
  popular?: boolean;
}

interface Pack {
  credits: number;
  priceNzd: number;
  priceId: string | null;
  popular?: boolean;
}

interface Addon {
  key: string;
  name: string;
  priceNzd: number;
  priceId: string | null;
  blurb: string;
}

interface Subscription {
  tier: string;
  status: string;
  credits_per_period: number;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  stripe_payment_intent_id?: string | null;
}

interface BillingData {
  subscription: Subscription | null;
  balance: number;
  transactions: Transaction[];
  plans: Plan[];
  packs: Pack[];
  addons: Addon[];
  activeAddons: string[];
}

const TIER_LABELS: Record<string, string> = {
  payg: "Pay as you go",
  creator: "Creator",
  business: "Business",
  agency: "Agency",
};

const TX_ICONS: Record<string, React.ReactNode> = {
  purchase: <ArrowUpRight className="w-3.5 h-3.5 text-success" />,
  debit: <ArrowDownRight className="w-3.5 h-3.5 text-destructive" />,
  refund: <RotateCcw className="w-3.5 h-3.5 text-primary" />,
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BillingPage() {
  const params = useParams<{ workspace: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const workspaceSlug = params.workspace;
  const storeSlug = useAppStore((s) => s.workspaceSlug);
  const setCreditBalance = useAppStore((s) => s.setCreditBalance);
  const slug = storeSlug || workspaceSlug;

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState<string | null>(null);
  const success = searchParams.get("success") === "1";

  // Fetch billing data AND push the authoritative DB balance into the global
  // store, so the TopBar credit pill / rails stay in sync with this page.
  const loadBilling = useCallback(async (): Promise<BillingData | null> => {
    try {
      const r = await api("/api/billing", { workspaceSlug: slug });
      if (!r.ok) return null;
      const d = (await r.json()) as BillingData;
      setData(d);
      setCreditBalance(d.balance);
      return d;
    } catch {
      return null;
    }
  }, [slug, setCreditBalance]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBilling()
      .then((d) => {
        if (!d) toast.error("Failed to load billing info");
      })
      .finally(() => setLoading(false));
  }, [loadBilling]);

  // After a Stripe checkout redirect (?success=1) the credit-granting webhook
  // is async — the balance may not have updated yet. Poll until the new
  // purchase transaction lands, then reflect it everywhere. Strip the param so
  // a refresh doesn't re-trigger.
  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    let tries = 0;
    window.history.replaceState({}, "", pathname);

    const recentPurchase = (d: BillingData | null) =>
      !!d?.transactions?.some(
        (t) =>
          t.type === "purchase" &&
          Date.now() - new Date(t.created_at).getTime() < 5 * 60 * 1000,
      );

    const tick = async () => {
      if (cancelled) return;
      const d = await loadBilling();
      tries += 1;
      // A credit pack/plan purchase shows up as a transaction; an add-on
      // purchase (e.g. Blend Package) never does — it just activates a
      // capability, so check activeAddons too instead of assuming credits.
      if (recentPurchase(d) || (d?.activeAddons.length ?? 0) > 0) {
        toast.success("Payment successful — your account has been updated!");
        return;
      }
      if (tries >= 8) {
        toast.success("Payment received — this will appear here shortly.");
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [success, loadBilling, pathname]);

  const handlePurchase = async (priceId: string | null, label: string) => {
    if (!priceId) {
      toast.error("This plan is not yet configured — contact support");
      return;
    }
    setPurchasing(priceId);
    try {
      const res = await api("/api/credits/purchase", {
        method: "POST",
        workspaceSlug: slug,
        body: JSON.stringify({ priceId }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Purchase failed");
      // eslint-disable-next-line react-hooks/immutability
      if (body.url) window.location.href = body.url;
    } catch (err) {
      toast.error(
        (err as Error).message ?? `Could not start checkout for ${label}`,
      );
    } finally {
      setPurchasing(null);
    }
  };

  // Open the Stripe-hosted receipt for a purchase (printable / saveable as PDF).
  const handleReceipt = async (txId: string) => {
    setReceiptLoading(txId);
    try {
      const res = await api(`/api/billing/invoice?txId=${txId}`, {
        workspaceSlug: slug,
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url)
        throw new Error(body.error ?? "Receipt not available");
      window.open(body.url, "_blank", "noopener");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not open the receipt");
    } finally {
      setReceiptLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await api("/api/billing/portal", {
        method: "POST",
        workspaceSlug: slug,
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url)
        throw new Error(body.error ?? "Could not open the billing portal");
      window.location.href = body.url;
    } catch (err) {
      toast.error(
        (err as Error).message ?? "Could not open the billing portal",
      );
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading billing…</span>
      </div>
    );
  }

  if (!data) return null;

  const tier = data.subscription?.tier ?? "payg";
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const periodEnd = data.subscription?.current_period_end;

  return (
    <div className="max-w-4xl space-y-10">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-1">
          Billing
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan and credit balance.
        </p>
      </div>

      {/* Balance + current plan */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-0.5">
              Credit Balance
            </p>
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {data.balance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              credits available
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-5">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
              tier === "payg" ? "bg-secondary" : "bg-amber-400/10",
            )}
          >
            <Crown
              className={cn(
                "w-6 h-6",
                tier === "payg" ? "text-muted-foreground" : "text-amber-400",
              )}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-0.5">
              Current Plan
            </p>
            <p className="text-xl font-bold text-foreground">{tierLabel}</p>
            {periodEnd && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Renews {fmt(periodEnd)}
              </p>
            )}
            {tier === "payg" && (
              <p className="text-xs text-muted-foreground mt-0.5">
                No monthly credits
              </p>
            )}
            {tier !== "payg" && data.subscription && (
              <p className="text-xs text-muted-foreground mt-0.5">
                +{data.subscription.credits_per_period.toLocaleString()} credits
                / month
              </p>
            )}
            {tier !== "payg" && (
              <Button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
              >
                {portalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                Manage subscription
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Subscription plans */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">
          Monthly Plans
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Credits reset each billing period. All prices in NZD.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.plans.map((plan) => {
            const isCurrent = tier === plan.id;
            const isConfigured = plan.priceId !== null;
            // Only spin for the purchase actually in flight — never match null===null
            // when a plan has no configured Stripe price (that caused permanent spinners).
            const isLoading =
              purchasing !== null && purchasing === plan.priceId;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border p-6 flex flex-col gap-4",
                  plan.popular
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card",
                  isCurrent && "ring-2 ring-primary/40",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Most popular
                    </span>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/20">
                      Current
                    </span>
                  </div>
                )}

                <div>
                  <p className="font-semibold text-foreground">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold text-foreground">
                      ${plan.priceNzd}
                    </span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan.creditsPerMonth.toLocaleString()} credits included
                  </p>
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePurchase(plan.priceId, plan.name)}
                  disabled={isCurrent || isLoading || !isConfigured}
                  variant={
                    isCurrent
                      ? "secondary"
                      : plan.popular
                        ? "default"
                        : "outline"
                  }
                  className={cn(
                    "w-full gap-2",
                    plan.popular &&
                      !isCurrent &&
                      isConfigured &&
                      "bg-primary hover:bg-primary/90 text-white",
                  )}
                  size="sm"
                >
                  {isLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {isCurrent
                    ? "Current plan"
                    : !isConfigured
                      ? "Coming soon"
                      : `Subscribe — $${plan.priceNzd}/mo`}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Add-ons — Business can unlock extra capabilities without a full Agency
          upgrade. Agency already has everything bundled, so nothing to sell it;
          payg/creator can't use these at any tier, so nothing to show them. */}
      {tier === "business" && data.addons.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Add-ons
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Extra capabilities for your Business plan.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.addons.map((addon) => {
              const isActive = data.activeAddons.includes(addon.key);
              const isConfigured = addon.priceId !== null;
              const isLoading =
                purchasing !== null && purchasing === addon.priceId;
              return (
                <div
                  key={addon.key}
                  className={cn(
                    "relative rounded-2xl border p-6 flex flex-col gap-4 bg-card",
                    isActive ? "border-success/40" : "border-border",
                  )}
                >
                  {isActive && (
                    <div className="absolute top-3 right-3">
                      <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded-full border border-success/20">
                        Active
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {addon.name}
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-foreground">
                          ${addon.priceNzd}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          /mo
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex-1">
                    {addon.blurb}
                  </p>
                  {isActive ? (
                    <Button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                    >
                      {portalLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      Manage
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handlePurchase(addon.priceId, addon.name)}
                      disabled={isLoading || !isConfigured}
                      variant="default"
                      className={cn(
                        "w-full gap-2",
                        isConfigured &&
                          "bg-primary hover:bg-primary/90 text-white",
                      )}
                      size="sm"
                    >
                      {isLoading && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {isConfigured
                        ? `Add for $${addon.priceNzd}/mo`
                        : "Coming soon"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Redeem a promo / friends-and-family code */}
      <section>
        <RedeemCode workspaceSlug={slug} onRedeemed={loadBilling} />
      </section>

      {/* Credit packs */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">
          Credit Packs
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          One-off top-ups. Credits never expire.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.packs.map((pack) => {
            const isConfigured = pack.priceId !== null;
            const isLoading =
              purchasing !== null && purchasing === pack.priceId;
            const label = `${pack.credits} credits`;
            return (
              <div
                key={pack.credits}
                className={cn(
                  "relative rounded-2xl border p-5 flex flex-col gap-4 bg-card",
                  pack.popular ? "border-primary/40" : "border-border",
                )}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                      Best value
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      pack.popular ? "bg-primary/10" : "bg-secondary",
                    )}
                  >
                    <Zap
                      className={cn(
                        "w-5 h-5",
                        pack.popular ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {pack.credits} credits
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${(pack.priceNzd / pack.credits).toFixed(2)} per credit
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handlePurchase(pack.priceId, label)}
                  disabled={isLoading || !isConfigured}
                  variant={pack.popular ? "default" : "outline"}
                  className={cn(
                    "w-full gap-2",
                    pack.popular &&
                      isConfigured &&
                      "bg-primary hover:bg-primary/90 text-white",
                  )}
                  size="sm"
                >
                  {isLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {isConfigured
                    ? `Buy for $${pack.priceNzd} NZD`
                    : "Coming soon"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Transaction history */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          Transaction History
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Last 30 transactions.
        </p>

        {data.transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
            No transactions yet — purchase a plan or credit pack above.
          </div>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Description
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Receipt
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx, i) => (
                  <tr
                    key={tx.id}
                    className={cn(
                      "border-t border-border",
                      i % 2 === 0 ? "bg-card" : "bg-secondary/20",
                    )}
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(tx.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {TX_ICONS[tx.type] ?? (
                          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className="text-sm text-foreground">
                          {tx.description}
                        </span>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono text-sm font-medium tabular-nums",
                        tx.amount > 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground tabular-nums">
                      {tx.balance_after}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.type === "purchase" && tx.stripe_payment_intent_id ? (
                        <button
                          onClick={() => handleReceipt(tx.id)}
                          disabled={receiptLoading === tx.id}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                          title="View / download receipt"
                        >
                          {receiptLoading === tx.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          Receipt
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
