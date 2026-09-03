"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquare,
  Music,
  Play,
  Send,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
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
    /** The one video this project publishes, or null if nothing is picked. */
    publishAssetId: string | null;
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
  workspaceSlug,
  onChanged,
  onStageVideo,
}: {
  progress: ProjectProgress | null;
  /** Studio's live name field — fresher than the server's copy mid-rename. */
  projectName?: string;
  focus?: StripFocus;
  /** Needed to address the API; without it the strip stays read-only. */
  workspaceSlug?: string;
  /** Re-fetch progress after a delete or a pick. */
  onChanged?: () => void;
  /**
   * Put the chosen clip on the Ad stage.
   *
   * The tick used to do one invisible thing — write
   * `campaigns.publish_asset_id` — and if the clip you ticked was already the
   * one the canvas happened to be showing, the screen did not change at all.
   * Read as a dead button, and reported as one.
   *
   * A tick means "this is the ad", so it now says so on the stage too: the
   * clip becomes the composition's background, which is what makes the rest
   * of the publish step possible (re-shape it for the platform, stamp the
   * brand, lay type over it) instead of a 96px thumbnail in the rail.
   */
  onStageVideo?: (video: { id: string; url: string }) => void;
}) {
  const [open, setOpen] = useState(true);
  // One id at a time — the tile shows a spinner in place of its own button
  // rather than the whole strip going busy.
  const [busyId, setBusyId] = useState<string | null>(null);

  const editable = !!workspaceSlug && !!progress;
  const campaignId = progress?.campaignId;

  /**
   * Delete one generated asset for good.
   *
   * Confirmed because it is not recoverable: the row and the Storage object
   * both go. The server refuses the anchor and anything already published
   * (see app/api/assets/[id]/route.ts) — those come back as a 409 with a
   * sentence worth showing verbatim, so the message is surfaced rather than
   * replaced with a generic failure.
   */
  const remove = async (id: string, what: string) => {
    if (!campaignId || !workspaceSlug || busyId) return;
    if (!window.confirm(`Delete this ${what}? This can't be undone.`)) return;
    setBusyId(id);
    try {
      const res = await api(`/api/assets/${id}`, {
        method: "DELETE",
        workspaceSlug,
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok)
        throw new Error(data?.error ?? `Couldn't delete the ${what}`);
      toast.success(`${what[0].toUpperCase()}${what.slice(1)} deleted`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Couldn't delete it`);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Delete a whole set of assets behind ONE confirm — "keep this, bin the rest".
   *
   * The per-tile bin covers "that render was a dud"; this covers what actually
   * happens, which is finishing a project and finding nine near-identical
   * exports and fourteen music takes behind it. Fourteen separate confirm
   * dialogs is not a cleanup tool, so this asks once and names the number.
   *
   * Sequential, not Promise.all: the server refuses a published asset and the
   * anchor, and firing fourteen deletes at once turns one refusal into a race
   * for which toast the user sees. Failures are counted and reported together,
   * and a refusal never stops the rest — the point is to end up tidy.
   */
  const removeAllBut = async (
    all: { id: string }[],
    keepId: string | null | undefined,
    noun: string,
  ) => {
    if (!campaignId || !workspaceSlug || busyId) return;
    const doomed = all.filter((a) => a.id !== keepId);
    if (doomed.length === 0) return;
    const n = doomed.length;
    const plural = n === 1 ? noun : `${noun}s`;
    if (
      !window.confirm(
        `Delete the other ${n} ${plural} in this project? Only the one you're keeping stays. This can't be undone.`,
      )
    )
      return;
    setBusyId("bulk");
    let gone = 0;
    let firstError: string | null = null;
    for (const a of doomed) {
      try {
        const res = await api(`/api/assets/${a.id}`, {
          method: "DELETE",
          workspaceSlug,
        });
        if (res.ok) gone += 1;
        else {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          firstError ??= data?.error ?? "Some couldn't be deleted";
        }
      } catch {
        firstError ??= "Some couldn't be deleted";
      }
    }
    setBusyId(null);
    onChanged?.();
    if (gone > 0)
      toast.success(`Deleted ${gone} ${gone === 1 ? noun : `${noun}s`}`);
    if (firstError) toast.error(firstError);
  };

  /**
   * Name the one video that publishes, and put it on the stage. Clicking the
   * current pick clears the name; it does NOT strip the stage, because taking
   * someone's backdrop away (along with every layer positioned against it) is
   * a much bigger act than un-naming a file.
   *
   * **Only a RAW clip reaches the stage.** A `composed_video` is the OUTPUT of
   * the stage — it already has the caption, brand mark and type burnt into its
   * pixels. Making it the backdrop leaves the doc's layers in place to be drawn
   * over the top of themselves, which renders as visibly doubled, ghosted text;
   * "Render this cut" from there bakes that doubling in for good. Same
   * input-vs-output distinction late-music.ts draws when it re-muxes onto the
   * export rather than rebuilding from the raw clip.
   *
   * So an export still becomes the pick — that is the whole point of ticking
   * one — and the stage keeps holding the editable ad it was built from.
   */
  const choose = async (id: string | null) => {
    if (!campaignId || !workspaceSlug || busyId) return;
    const video = id
      ? (progress?.bundle.videos.find((v) => v.id === id) ?? null)
      : null;
    setBusyId(id ?? "clear");
    try {
      const res = await api(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        workspaceSlug,
        body: JSON.stringify({ publish_asset_id: id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Couldn't set the video");
      }
      if (video && !video.branded)
        onStageVideo?.({ id: video.id, url: video.url });
      toast.success(
        !video
          ? "Video un-picked"
          : video.branded
            ? "This export publishes — the stage keeps the ad you built it from"
            : "On the stage — this is the video that publishes",
      );
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't set the video",
      );
    } finally {
      setBusyId(null);
    }
  };

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

  // Music's equivalent of the video pick, except it isn't a choice: publish's
  // late-music remux always takes the newest track, so this is a readout of
  // what the mix will use, not a preference to be set.
  const newestTrackId =
    [...bundle.audio].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      ?.id ?? null;

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
              <div className="flex items-center gap-1.5">
                {bundle.videos.map((v) => {
                  const picked = v.id === bundle.publishAssetId;
                  const busy = busyId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-black ${
                        picked
                          ? "border-primary ring-1 ring-primary/40"
                          : "border-border"
                      }`}
                    >
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${v.branded ? "Branded export" : "Raw clip"} — open to play`}
                        className="block h-full w-full"
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
                      </a>
                      {v.branded && !picked && (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-primary/80 text-center text-[8px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Brand
                        </span>
                      )}
                      {picked && (
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-primary text-center text-[8px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Publishes
                        </span>
                      )}
                      {editable && (
                        <>
                          {/* Visible at rest, not hover-revealed.

                              These started hidden until hover, on the usual
                              reasoning that a row of tiles should read as the
                              work rather than as a toolbar. That's the wrong
                              trade here: the whole reason this row exists is
                              that ten near-identical clips piled up with no
                              way to remove one, and a control you have to
                              discover by hovering solves that for nobody. They
                              sit at 70% over a dimmed corner and come up to
                              full on hover. */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => choose(picked ? null : v.id)}
                            title={
                              picked
                                ? "This is the video that publishes — click to un-pick"
                                : v.branded
                                  ? "Publish this export — your editable ad stays on the stage"
                                  : "Put this clip on the stage and publish it"
                            }
                            aria-label={
                              picked
                                ? "Un-pick this video"
                                : "Publish this video"
                            }
                            className={`absolute left-0.5 top-0.5 rounded-full p-0.5 transition-opacity ${
                              picked
                                ? "bg-primary text-primary-foreground"
                                : "bg-black/70 text-white opacity-70 hover:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                            }`}
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => remove(v.id, "video")}
                            title="Delete this video"
                            aria-label="Delete this video"
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-70 transition-opacity hover:bg-red-600 hover:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {/* Only offered once a keeper is named — "delete the others"
                    has no meaning until there IS a chosen one, and offering it
                    beforehand would ask the user to trust a heuristic pick. */}
                {editable &&
                  bundle.publishAssetId &&
                  bundle.videos.length > 1 && (
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() =>
                        removeAllBut(
                          bundle.videos,
                          bundle.publishAssetId,
                          "video",
                        )
                      }
                      title={`Delete the other ${bundle.videos.length - 1} videos and keep the one that publishes`}
                      className="flex h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border px-2 text-[10px] leading-tight text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-500 disabled:opacity-50"
                    >
                      {busyId === "bulk" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>Tidy {bundle.videos.length - 1}</span>
                    </button>
                  )}
              </div>
            </div>
          )}

          {bundle.audio.length > 0 && (
            <div
              className={`${GROUP_SHELL} ${focus === "audio" ? GROUP_FOCUS : GROUP_IDLE}`}
            >
              <span className={GROUP_LABEL}>Music</span>
              <div className="flex items-center gap-1.5">
                {bundle.audio.map((a) => (
                  <span key={a.id} className="flex items-center gap-1">
                    <span className="flex flex-col gap-0.5">
                      <audio
                        src={a.url}
                        controls
                        preload="none"
                        className="h-8 w-44"
                      />
                      {/* Music has no pick of its own: /api/publish always
                          mixes the NEWEST track (see its late-music remux), so
                          saying which one that is beats making the user infer
                          it from playback order.

                          The tooltip carries the caveat the badge can't: an
                          export rendered AFTER this track already has its own
                          bed burnt in and won't be re-muxed, so "in the mix"
                          is about what publish would add, not a promise about
                          what every existing cut already sounds like. */}
                      {a.id === newestTrackId && (
                        <span
                          title="The newest track — this is the one publishing mixes onto your video. An export rendered after it already has its own soundtrack baked in."
                          className="text-center text-[9px] font-semibold uppercase tracking-wide text-primary"
                        >
                          In the mix
                        </span>
                      )}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => remove(a.id, "track")}
                        title="Delete this track"
                        aria-label="Delete this track"
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      >
                        {busyId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </span>
                ))}
                {/* No confirmation of a keeper needed here, unlike video: the
                    newest track is not a guess, it's the one the publish mix
                    actually uses. */}
                {editable && bundle.audio.length > 1 && (
                  <button
                    type="button"
                    disabled={!!busyId}
                    onClick={() =>
                      removeAllBut(bundle.audio, newestTrackId, "track")
                    }
                    title={`Delete the other ${bundle.audio.length - 1} tracks and keep the one in the mix`}
                    className="flex h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border px-2 text-[10px] leading-tight text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-500 disabled:opacity-50"
                  >
                    {busyId === "bulk" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>Tidy {bundle.audio.length - 1}</span>
                  </button>
                )}
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
