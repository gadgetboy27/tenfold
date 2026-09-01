import type { Session } from "@/lib/auth/session";

/**
 * Who may wire up, or tear down, where this workspace publishes.
 *
 * `POST /api/publish` gates members behind campaign approval, so a member
 * cannot post without a sign-off. But connecting and disconnecting had no role
 * check at all — meaning a member couldn't publish a post, yet could repoint
 * the workspace's Facebook at a Page they own, or disconnect the org's
 * accounts outright. The gate was on the act and not on the destination, which
 * is the wrong half.
 *
 * Owner/admin only, matching the approval bypass in the publish route: the
 * roles trusted to approve what goes out are the roles trusted to decide where
 * out is.
 */
export const CONNECTION_MANAGER_ROLES = new Set(["owner", "admin"]);

export function canManageConnections(session: Session): boolean {
  return CONNECTION_MANAGER_ROLES.has(session.role);
}

/** The refusal, phrased so a member knows it isn't a bug and what to do. */
export const CONNECTION_FORBIDDEN = {
  error:
    "Only workspace owners and admins can connect or disconnect social accounts. Ask one of them to make this change.",
  code: "connection_role_required",
} as const;
