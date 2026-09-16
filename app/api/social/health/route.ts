import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { decryptProfileTokens } from "@/lib/social/token-crypto";
import {
  checkMetaConnection,
  type ConnectionHealth,
} from "@/lib/social/health";

/**
 * Per-platform connection health. Deliberately its own route rather than a
 * field on /api/social/profiles: this calls out to Meta, and the settings page
 * must render its connections immediately rather than waiting on a third party
 * to answer.
 */
export const GET = withWorkspace(
  async (_req, { db }) => {
    const { data: profiles } = await db
      .from("social_profiles")
      .select("platform, platform_page_id, access_token")
      .in("platform", ["facebook", "instagram"]);

    // Decrypt before asking Meta anything: sending ciphertext to debug_token
    // reports every connection as invalid, which is a far more convincing lie
    // than the one this check exists to stop.
    const rows = (
      (profiles ?? []) as {
        platform: string;
        platform_page_id: string | null;
        access_token: string | null;
      }[]
    ).map((r) => decryptProfileTokens(r));

    const health: Record<string, ConnectionHealth> = {};
    await Promise.all(
      rows.map(async (row) => {
        if (!row.access_token) {
          health[row.platform] = {
            status: "token_invalid",
            message: "No stored credential — reconnect this account.",
          };
          return;
        }
        health[row.platform] = await checkMetaConnection(
          row.access_token,
          row.platform_page_id,
        );
      }),
    );

    return NextResponse.json(health);
  },
  // Two Meta round-trips per call; keep the default per-IP limit on.
  { rateLimit: 30 },
);
