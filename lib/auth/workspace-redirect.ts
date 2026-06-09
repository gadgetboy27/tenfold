"use client";

/**
 * Resolve the path to send an authenticated user to. Prefers a slug we already
 * know (from the login API response or user metadata); otherwise asks the
 * idempotent provision endpoint. Falls back to the dashboard root.
 */
export async function resolveWorkspacePath(
  knownSlug?: string | null,
): Promise<string> {
  if (knownSlug) return `/${knownSlug}`;
  try {
    const res = await fetch("/api/workspaces/provision", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { slug?: string };
      if (data.slug) return `/${data.slug}`;
    }
  } catch {
    // ignore — fall through to root
  }
  return "/";
}
