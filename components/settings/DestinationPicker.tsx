"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

interface Props {
  platform: "reddit" | "pinterest";
  workspaceSlug: string;
  /** Current destination, or null when nothing has been chosen yet. */
  current: string | null;
  /** Pinterest only — the boards fetched at connect time. */
  boards?: { id: string; name: string }[];
  onSaved: () => void;
}

/**
 * Reddit and Pinterest need a destination the caption can't carry (a subreddit
 * / a board). Without one the connection looks healthy but every publish fails,
 * so an unset destination is rendered as a warning rather than an empty field.
 */
export function DestinationPicker({
  platform,
  workspaceSlug,
  current,
  boards = [],
  onSaved,
}: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    setSaving(true);
    try {
      const res = await api("/api/social/destination", {
        method: "POST",
        body: JSON.stringify(
          platform === "reddit"
            ? { platform, subreddit: next }
            : { platform, boardId: next },
        ),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      toast.success("Destination saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Could not save destination");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 border-t border-success/20 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">
        {platform === "reddit" ? "Posting to subreddit:" : "Pinning to board:"}
      </span>

      {platform === "pinterest" ? (
        boards.length > 0 ? (
          <select
            value={boards.find((b) => b.name === current)?.id ?? ""}
            disabled={saving}
            onChange={(e) => save(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="" disabled>
              Choose a board…
            </option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            No boards found on this Pinterest account — create one in Pinterest,
            then reconnect.
          </span>
        )
      ) : (
        <div className="flex gap-1.5">
          <input
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(value);
            }}
            placeholder={current ?? "r/yoursubreddit"}
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={() => save(value)}
            disabled={saving || !value.trim()}
            className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      )}

      {!current && platform === "reddit" && (
        <span className="text-xs text-amber-600 dark:text-amber-500">
          Pick a subreddit — posts can&apos;t go anywhere until you do.
        </span>
      )}
      {current && (
        <span className="text-xs font-medium">Currently: {current}</span>
      )}
    </div>
  );
}
