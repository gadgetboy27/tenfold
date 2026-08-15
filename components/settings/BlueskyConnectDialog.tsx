"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Props {
  workspaceSlug: string;
  onClose: () => void;
  onConnected: () => void;
}

/**
 * Bluesky is the only network with no OAuth redirect: the user generates an
 * *app password* in the Bluesky client and pastes it here. Kept in its own
 * component because the settings page is already far past the 200-line
 * convention and this is self-contained.
 */
export function BlueskyConnectDialog({
  workspaceSlug,
  onClose,
  onConnected,
}: Props) {
  const [identifier, setIdentifier] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // App passwords are xxxx-xxxx-xxxx-xxxx. Nudging on the shape here catches
  // the common mistake — pasting the real account password — before it's sent
  // anywhere, rather than after we've handed it to Bluesky.
  const looksLikeAccountPassword =
    appPassword.length > 0 &&
    !/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i.test(appPassword);

  const submit = async () => {
    if (!identifier.trim() || !appPassword.trim()) return;
    setSaving(true);
    try {
      const res = await api("/api/social/connect/bluesky", {
        method: "POST",
        body: JSON.stringify({ identifier, appPassword }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        handle?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not connect Bluesky");
      toast.success(`Bluesky connected as @${data.handle}`);
      onConnected();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Could not connect Bluesky");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bluesky-connect-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="bluesky-connect-title"
              className="text-lg font-semibold text-foreground"
            >
              Connect Bluesky
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bluesky uses an app password, not your account password.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium" htmlFor="bsky-handle">
          Handle
        </label>
        <input
          id="bsky-handle"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="yourname.bsky.social"
          autoComplete="username"
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="bsky-pw">
          App password
        </label>
        <input
          id="bsky-pw"
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        {looksLikeAccountPassword && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
            That doesn&apos;t look like an app password. Generate one in Bluesky
            → Settings → Privacy and security → App passwords — it can be
            revoked without changing your real password.
          </p>
        )}

        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-primary underline"
        >
          Create an app password on Bluesky
        </a>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !identifier.trim() || !appPassword.trim()}
          >
            {saving ? "Checking…" : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
