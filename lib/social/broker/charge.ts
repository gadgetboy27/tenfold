import { v4 as uuidv4 } from "uuid";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { publishViaBroker, type BrokerPlatform } from "./outstand";

/**
 * A brokered publish and its credit charge, as one operation.
 *
 * This is the only backend that costs money per post, so it is the only one
 * that touches the ledger — and it needs to be reachable from two places in the
 * publish route: networks with no direct adapter at all (X, Threads, GMB,
 * Telegram), and networks whose adapter exists but has no connected account yet
 * (TikTok and YouTube, while their platform reviews are pending). Inlining it
 * twice is how the two copies drift until one of them forgets to refund.
 *
 * The contract matches every fal job (CLAUDE.md §1): debit first, and if the
 * work doesn't happen, give it back. Never charge for a post that didn't go
 * out; never send one that wasn't charged.
 */

export type BrokeredOutcome =
  | { ok: true; postId: string }
  | { ok: false; error: string };

export async function publishBrokeredWithCredits(params: {
  workspaceId: string;
  platform: BrokerPlatform;
  mediaUrl: string;
  caption: string;
  scheduledAt?: string;
}): Promise<BrokeredOutcome> {
  // One id per attempt. The debit and its refund only need to agree with each
  // other, and credit_transactions.job_id is a uuid column.
  const jobId = uuidv4();

  const debit = await debitCredits(
    params.workspaceId,
    jobId,
    "brokered_publish",
  );
  if (!debit.success) {
    // Point at the free path rather than just refusing — connecting the account
    // directly removes this charge permanently.
    return {
      ok: false,
      error:
        "Not enough credits to publish to this network. Connect it directly in Settings → Social to publish free.",
    };
  }

  try {
    const { id } = await publishViaBroker({
      accountId: params.workspaceId,
      platform: params.platform,
      mediaUrl: params.mediaUrl,
      caption: params.caption,
      ...(params.scheduledAt ? { scheduledAt: params.scheduledAt } : {}),
    });
    return { ok: true, postId: id };
  } catch (err) {
    await refundCredits(jobId);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Publishing failed",
    };
  }
}
