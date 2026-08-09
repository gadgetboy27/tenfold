"use client";

import { useState } from "react";
import {
  ChevronDown,
  Film,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Music,
  Send,
} from "lucide-react";
import { thumbUrl } from "@/lib/images/thumb";

/**
 * "Everything under this project name."
 *
 * Work in Studio fans out across a dozen sections, and until you get to the
 * Compositor or Publish there's no screen that shows what a project actually
 * amounts to — you had to reopen each section to remember what you'd made.
 * This is the one place the whole project is visible at once, so a user can
 * look over it before deciding what still needs fine-tuning.
 *
 * Fed by GET /api/campaigns/:id/progress, the same payload driving the nav's
 * tick marks — one fetch, two views of the same state.
 */

export interface ProjectProgress {
  campaignId: string;
  campaignName: string | null;
  approvalStatus: string | null;
  done: {
    images: boolean;
    productshot: boolean;
    tryon: boolean;
    video: boolean;
    talking: boolean;
    autocaption: boolean;
    music: boolean;
    caption: boolean;
    compositor: boolean;
    logo: boolean;
    publish: boolean;
  };
  bundle: {
    images: { id: string; url: string; createdAt: string }[];
    videos: { id: string; url: string; branded: boolean; createdAt: string }[];
    audio: { id: string; url: string; createdAt: string }[];
    caption: string;
    anchorId: string | null;
    compositionCount: number;
  };
}

export function ProjectBundle({
  progress,
  projectName,
  defaultOpen = false,
}: {
  progress: ProjectProgress | null;
  /** Studio's live name field — fresher than the server's copy mid-rename. */
  projectName?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!progress) return null;

  const { bundle, done } = progress;
  const name = projectName?.trim() || progress.campaignName || "This project";
  const counts = [
    { icon: ImageIcon, n: bundle.images.length, label: "images" },
    { icon: Film, n: bundle.videos.length, label: "videos" },
    { icon: Music, n: bundle.audio.length, label: "tracks" },
    {
      icon: Layers,
      n: bundle.compositionCount,
      label: "compositions",
    },
  ].filter((c) => c.n > 0);

  const nothingYet =
    counts.length === 0 && !bundle.caption && !done.publish && !done.logo;
  if (nothingYet) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="text-[13px] font-semibold text-foreground">
          Everything in “{name}”
        </span>
        <span className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
          {counts.map(({ icon: Icon, n, label }) => (
            <span key={label} className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {n} {label}
            </span>
          ))}
          {bundle.caption && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              caption
            </span>
          )}
          {done.publish && (
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <Send className="h-3 w-3" />
              published
            </span>
          )}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {bundle.images.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Images
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {bundle.images.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      a.id === bundle.anchorId
                        ? "Your chosen anchor image"
                        : "Open full size"
                    }
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                      a.id === bundle.anchorId
                        ? "border-primary"
                        : "border-border"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(a.url, { width: 128 })}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {bundle.videos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Videos
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {bundle.videos.map((v) => (
                  <div key={v.id} className="shrink-0 space-y-1">
                    <video
                      src={v.url}
                      controls
                      preload="metadata"
                      className="h-24 rounded-md border border-border bg-black"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {v.branded ? "Branded export" : "Raw clip"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bundle.audio.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Music
              </p>
              {bundle.audio.map((a) => (
                <audio key={a.id} src={a.url} controls className="h-8 w-full" />
              ))}
            </div>
          )}

          {bundle.caption && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Caption
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-2 text-xs text-foreground">
                {bundle.caption}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
