"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { thumbUrl } from "@/lib/images/thumb";

/**
 * "Use one you already made" — the counterpart to every file upload in the app.
 *
 * Every generative step in Tenfold produces an asset the workspace already paid
 * for, so any screen asking for an image (or a video) should let the user reach
 * back for one instead of hunting a file on disk. This is the single picker for
 * that: a modal over GET /api/gallery (images) or GET /api/productions (video),
 * both already workspace-scoped, opening on the current project's own assets
 * when there is one.
 *
 * Deliberately NOT offered where a gallery asset can't be the right answer —
 * the Compositor's inpaint mask (a purpose-made black/white matte) and audio
 * uploads.
 */

export interface PickableAsset {
  id: string;
  url: string;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
}

interface GalleryPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (asset: PickableAsset) => void;
  workspaceSlug: string;
  /** Current project — its assets get their own tab, shown first. */
  campaignId?: string | null;
  /** Images (default) come from the Gallery; videos from Productions. */
  kind?: "image" | "video";
  title?: string;
  /** Extra guidance under the title, e.g. what makes a good source image. */
  hint?: string;
}

interface GalleryResponse {
  assets?: {
    id: string;
    url: string;
    campaign_id: string | null;
    created_at: string;
  }[];
}

interface ProductionsResponse {
  productions?: {
    id: string;
    url: string;
    campaignId: string | null;
    campaignName: string | null;
    createdAt: string;
  }[];
}

export function GalleryPicker({
  open,
  onClose,
  onPick,
  workspaceSlug,
  campaignId,
  kind = "image",
  title,
  hint,
}: GalleryPickerProps) {
  const [items, setItems] = useState<PickableAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"project" | "all">("all");

  // Open on the current project's own work when there is one — that's what a
  // user reaching for "one I already made" almost always means. Deferred to a
  // microtask so the update lands in a callback, not synchronously in the
  // effect body (the repo's standard shape for this).
  useEffect(() => {
    if (open) queueMicrotask(() => setScope(campaignId ? "project" : "all"));
  }, [open, campaignId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(
        kind === "video"
          ? "/api/productions?kinds=video,composed_video"
          : "/api/gallery",
        { workspaceSlug },
      );
      if (!res.ok) throw new Error("Couldn't load your library");
      if (kind === "video") {
        const data = (await res.json()) as ProductionsResponse;
        setItems(
          (data.productions ?? []).map((p) => ({
            id: p.id,
            url: p.url,
            campaignId: p.campaignId,
            campaignName: p.campaignName,
            createdAt: p.createdAt,
          })),
        );
      } else {
        const data = (await res.json()) as GalleryResponse;
        setItems(
          (data.assets ?? []).map((a) => ({
            id: a.id,
            url: a.url,
            campaignId: a.campaign_id,
            campaignName: null,
            createdAt: a.created_at,
          })),
        );
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, workspaceSlug]);

  // Fetch once per opening, so a newly generated asset shows up next time
  // rather than being cached away behind a stale list.
  useEffect(() => {
    if (open) queueMicrotask(() => void load());
  }, [open, load]);

  const inProject = useMemo(
    () =>
      campaignId
        ? (items ?? []).filter((i) => i.campaignId === campaignId)
        : [],
    [items, campaignId],
  );
  const shown = scope === "project" ? inProject : (items ?? []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Choose from your library"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderOpen className="h-4 w-4 text-primary" />
              {title ??
                (kind === "video"
                  ? "Use a video you already made"
                  : "Use an image you already made")}
            </h2>
            {hint && (
              <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {campaignId && (
          <div className="flex gap-1.5 border-b border-border px-4 py-2">
            {(
              [
                ["project", `This project (${inProject.length})`],
                ["all", `Everything (${items?.length ?? 0})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  scope === id
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading || items === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your library…
            </div>
          ) : shown.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {scope === "project"
                ? "Nothing made in this project yet — switch to Everything, or upload a file."
                : kind === "video"
                  ? "No videos yet — generate one first, or upload a file."
                  : "No images yet — generate some first, or upload a file."}
            </p>
          ) : (
            // Container-driven: this modal is also opened from inside the
            // generation rail, where viewport breakpoints misjudge width.
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
              {shown.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onPick(a);
                    onClose();
                  }}
                  title={a.campaignName ?? undefined}
                  className="h-[110px] overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-primary/60"
                >
                  {kind === "video" ? (
                    <video
                      src={a.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl(a.url, { width: 300 })}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The standard trigger that sits beside a file input, so "upload from file" and
 * "use from gallery" read as one pair of choices everywhere they appear.
 */
export function GalleryPickButton({
  onClick,
  label,
  className,
  disabled,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    >
      <FolderOpen className="h-3.5 w-3.5" />
      {label ?? "Use from gallery"}
    </button>
  );
}
