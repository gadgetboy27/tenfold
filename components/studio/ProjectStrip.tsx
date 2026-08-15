"use client";

import { useState } from "react";
import {
  ChevronDown,
  Film,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Music,
  Play,
  Send,
} from "lucide-react";
import { thumbUrl } from "@/lib/images/thumb";

/**
 * The project strip — "here's what you're working on", on every screen.
 *
 * Work in Studio fans out across a dozen sections, and each one used to fill
 * the canvas with only its own output. Switching from Video to Music replaced
 * everything on screen, so the thing being made went invisible exactly when a
 * user needed to keep it in mind. This rail is pinned below <main> and renders
 * for every section, so the project is continuously present from brief through
 * to publish.
 *
 * It replaces the earlier collapsible `ProjectBundle`, which held the same
 * content but was mounted only on the Compositor and Publish canvases and
 * defaulted to closed — the same "architecturally absent on most screens"
 * shape that `StudioNav` was hoisted out of (see CLAUDE.md).
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

/**
 * Which kind of asset the section on screen is actually working on. Drives the
 * "in use" tint, so the strip answers "which of these is this screen about?"
 * rather than just listing everything.
 */
export type StripFocus = "images" | "video" | "audio" | "caption" | null;

const GROUP_SHELL =
  "flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5";
const GROUP_IDLE = "border-border";
const GROUP_FOCUS = "border-primary/40 bg-primary/5";
const GROUP_LABEL =
  "text-[10px] uppercase tracking-wider text-muted-foreground";

export function ProjectStrip({
  progress,
  projectName,
  focus = null,
}: {
  progress: ProjectProgress | null;
  /** Studio's live name field — fresher than the server's copy mid-rename. */
  projectName?: string;
  focus?: StripFocus;
}) {
  const [open, setOpen] = useState(true);
  if (!progress) return null;

  const { bundle, done } = progress;
  const name = projectName?.trim() || progress.campaignName || "This project";

  const counts = [
    { icon: ImageIcon, n: bundle.images.length, label: "images" },
    { icon: Film, n: bundle.videos.length, label: "videos" },
    { icon: Music, n: bundle.audio.length, label: "tracks" },
    { icon: Layers, n: bundle.compositionCount, label: "compositions" },
  ].filter((c) => c.n > 0);

  // Nothing made yet — an empty rail on the brief screen is just chrome.
  const nothingYet =
    counts.length === 0 && !bundle.caption && !done.publish && !done.logo;
  if (nothingYet) return null;

  return (
    <section
      aria-label={`Everything in ${name}`}
      className="shrink-0 border-t border-border bg-card"
    >
      <div className="flex items-center gap-2.5 px-4 py-1.5">
        <span className="shrink-0 text-[11px] font-semibold text-foreground">
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
          {counts.map(({ icon: Icon, n, label }) => (
            <span key={label} className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {n} {label}
            </span>
          ))}
          {done.publish && (
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <Send className="h-3 w-3" />
              published
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={open ? "Hide the project strip" : "Show the project strip"}
          className="ml-auto shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {open && (
        <div className="flex items-stretch gap-2 overflow-x-auto px-4 pb-2.5">
          {bundle.images.length > 0 && (
            <div
              className={`${GROUP_SHELL} ${focus === "images" ? GROUP_FOCUS : GROUP_IDLE}`}
            >
              <span className={`${GROUP_LABEL} [writing-mode:vertical-rl]`}>
                Images
              </span>
              <div className="flex gap-1.5">
                {bundle.images.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      a.id === bundle.anchorId
                        ? "Your chosen anchor image — open full size"
                        : "Open full size"
                    }
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border ${
                      a.id === bundle.anchorId
                        ? "border-primary ring-1 ring-primary/40"
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
            <div
              className={`${GROUP_SHELL} ${focus === "video" ? GROUP_FOCUS : GROUP_IDLE}`}
            >
              <span className={`${GROUP_LABEL} [writing-mode:vertical-rl]`}>
                Video
              </span>
              <div className="flex gap-1.5">
                {bundle.videos.map((v) => (
                  <a
                    key={v.id}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${v.branded ? "Branded export" : "Raw clip"} — open to play`}
                    className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-black"
                  >
                    {/* #t=0.1 seeks to the first frame so the tile shows the
                        clip rather than a black box; metadata-only preload
                        keeps a dozen of these off the network budget. */}
                    <video
                      src={`${v.url}#t=0.1`}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <Play className="h-3.5 w-3.5 fill-white text-white" />
                    </span>
                    {v.branded && (
                      <span className="absolute inset-x-0 bottom-0 bg-primary/80 text-center text-[8px] font-semibold uppercase tracking-wide text-primary-foreground">
                        Brand
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {bundle.audio.length > 0 && (
            <div
              className={`${GROUP_SHELL} ${focus === "audio" ? GROUP_FOCUS : GROUP_IDLE}`}
            >
              <span className={GROUP_LABEL}>Music</span>
              <div className="flex gap-1.5">
                {bundle.audio.map((a) => (
                  <audio
                    key={a.id}
                    src={a.url}
                    controls
                    preload="none"
                    className="h-8 w-44"
                  />
                ))}
              </div>
            </div>
          )}

          {bundle.caption && (
            <div
              className={`${GROUP_SHELL} ${focus === "caption" ? GROUP_FOCUS : GROUP_IDLE} max-w-sm`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p
                title={bundle.caption}
                className="line-clamp-2 text-[11px] leading-snug text-foreground"
              >
                {bundle.caption}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
