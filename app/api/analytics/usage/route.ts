import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUsageSummary } from "@/lib/costs/tracker";
import {
  PROVIDER_COST_USD,
  creditValueUsd,
  NZD_USD_RATE,
} from "@/lib/costs/rates";
import { CREDIT_COSTS } from "@/lib/credits/costs";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const url = new URL(req.url);

    // Default: current calendar month
    const now = new Date();
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toParam ? new Date(toParam) : now;

    const summary = await getUsageSummary(session.workspaceId, from, to);

    // Price the rate card at what THIS workspace's credits actually sold for.
    // It was priced at a flat $0.10/credit — a rate nobody pays — which showed
    // every action comfortably profitable. At the real subscription rate,
    // video sells at ~1.3x its inference cost.
    const rate = summary.creditRateUsd;
    const rateCard = Object.entries(CREDIT_COSTS).map(([type, credits]) => {
      const revenueUsd = credits * rate;
      const providerCostUsd = PROVIDER_COST_USD[type] ?? 0;
      return {
        type,
        credits,
        revenueUsd,
        revenueNzd: NZD_USD_RATE > 0 ? revenueUsd / NZD_USD_RATE : 0,
        providerCostUsd,
        marginUsd: revenueUsd - providerCostUsd,
        marginPct:
          revenueUsd > 0
            ? Math.round(((revenueUsd - providerCostUsd) / revenueUsd) * 100)
            : providerCostUsd > 0
              ? -100
              : 0,
        // The number that actually matters, and the one the flat rate hid.
        markup:
          providerCostUsd > 0
            ? Number((revenueUsd / providerCostUsd).toFixed(2))
            : null,
      };
    });

    return NextResponse.json({
      summary,
      rateCard,
      // Say what the card assumes; a margin with no stated rate is a rumour.
      pricedAs: { creditSource: summary.creditSource, creditRateUsd: rate },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
