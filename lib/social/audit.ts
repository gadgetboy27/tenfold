import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The security log for a workspace's publishing destinations.
 *
 * A connected account is standing permission to post in a business's name, and
 * until now nothing recorded who granted or withdrew it. `social_profiles`
 * overwrites `connected_at` on every upsert, so even the one timestamp that
 * existed was erased by the next reconnect.
 *
 * Writes here are best-effort and must never fail the action they describe.
 * A disconnect that 500s because its audit row wouldn't insert leaves the user
 * unable to remove an account they're trying to cut off — the logging would
 * have become the vulnerability. Losing one row is the lesser harm, and a
 * failed insert is visible in the logs.
 */

export type SocialAction =
  | "connected"
  | "reconnected"
  | "disconnected"
  | "page_switched";

export interface SocialAuditDetail {
  /** What the provider said when we tried to revoke. */
  revoke?: string;
  /** Facebook Page / board / subreddit involved, when relevant. */
  target?: string | null;
  /** Why it failed, when it did. */
  error?: string;
  [key: string]: unknown;
}

/**
 * Who did it. Takes ids rather than a Session because the OAuth callbacks —
 * where a "connected" event is born — have no session: they authenticate the
 * round-trip with the HMAC-signed `state` and recover only a workspaceId.
 * A null actor is an honest "we know it happened here, not who", which beats
 * either dropping the event or inventing an actor.
 */
export interface SocialActor {
  workspaceId: string;
  userId?: string | null;
}

/**
 * Record one change to a workspace's connections.
 *
 * `actorEmail` is denormalised on purpose: the log has to stay readable after
 * the account is deleted, and a departed employee's actions are exactly when
 * anyone reads it.
 *
 * NEVER pass a token in `detail`. This table is read by humans, and a
 * credential in a log is a credential in a screenshot.
 */
export async function recordSocialEvent(
  admin: SupabaseClient,
  actor: SocialActor,
  platform: string,
  action: SocialAction,
  detail: SocialAuditDetail = {},
): Promise<void> {
  try {
    let actorEmail: string | null = null;
    if (actor.userId) {
      try {
        const { data } = await admin.auth.admin.getUserById(actor.userId);
        actorEmail = data?.user?.email ?? null;
      } catch {
        // An unreadable email must not cost us the row — the user id still
        // identifies the actor, the email is only there to keep it legible.
      }
    }
    await admin.from("social_connection_events").insert({
      workspace_id: actor.workspaceId,
      actor_user_id: actor.userId ?? null,
      actor_email: actorEmail,
      platform,
      action,
      detail,
    });
  } catch {
    // See the note above: logging never breaks the thing being logged.
  }
}
