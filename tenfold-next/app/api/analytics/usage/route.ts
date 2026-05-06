import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getUsageSummary } from '@/lib/costs/tracker';
import { PROVIDER_COST_USD, CREDIT_VALUE_USD, NZD_USD_RATE } from '@/lib/costs/rates';
import { CREDIT_COSTS } from '@/lib/credits/costs';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const url = new URL(req.url);

    // Default: current calendar month
    const now = new Date();
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toParam ? new Date(toParam) : now;

    const summary = await getUsageSummary(session.workspaceId, from, to);

    // Attach the rate card so the frontend can render a pricing table
    const rateCard = Object.entries(CREDIT_COSTS).map(([type, credits]) => ({
      type,
      credits,
      revenueUsd: credits * CREDIT_VALUE_USD,
      revenueNzd: credits * CREDIT_VALUE_USD / NZD_USD_RATE,
      providerCostUsd: PROVIDER_COST_USD[type] ?? 0,
      marginUsd: credits * CREDIT_VALUE_USD - (PROVIDER_COST_USD[type] ?? 0),
      marginPct:
        credits * CREDIT_VALUE_USD > 0
          ? Math.round(
              ((credits * CREDIT_VALUE_USD - (PROVIDER_COST_USD[type] ?? 0)) /
                (credits * CREDIT_VALUE_USD)) *
                100,
            )
          : 0,
    }));

    return NextResponse.json({ summary, rateCard });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
