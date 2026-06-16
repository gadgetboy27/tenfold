import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { redeemPromoCode } from "@/lib/credits/redeem";

const RedeemSchema = z.object({ code: z.string().trim().min(1).max(64) });

const MESSAGES: Record<string, string> = {
  invalid: "That code isn't valid.",
  inactive: "That code isn't active yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully redeemed.",
  already_redeemed: "You've already redeemed this code.",
  error: "Couldn't redeem right now — please try again.",
};

export const POST = withWorkspace(async (req, { session }) => {
  const parsed = RedeemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a code to redeem." }, { status: 400 });
  }

  const result = await redeemPromoCode(session.workspaceId, parsed.data.code);

  if (!result.success) {
    const status =
      result.reason === "already_redeemed" ? 409 : result.reason === "error" ? 500 : 400;
    return NextResponse.json(
      { error: MESSAGES[result.reason] ?? "That code can't be redeemed." },
      { status },
    );
  }

  return NextResponse.json({ balance: result.balance, credits: result.credits });
});
