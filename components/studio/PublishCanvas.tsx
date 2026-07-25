"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  Loader2,
  Sparkles,
  Music2,
  VolumeX,
  Play,
  Image as ImageIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PLATFORM_FORMATS, type PlatformId } from "@/lib/composition/formats";
import { PLATFORM_GUIDE } from "@/lib/claude/adapt-captions";
import { platformDefaults } from "@/lib/social/platform-defaults";

/**
 * Studio-native Publish surface. Ported from the classic dashboard's
 * Step6Publish (real, working, but unreachable — no route renders its parent
 * since Studio became the main site) rather than rebuilt: same endpoints
 * (/api/publish, /api/publish/adapt-captions, /api/social/profiles,
 * /api/social/connect*), reading Studio's own state instead of the classic
 * useAppStore campaign. Simplified from the original's dual image+video
 * independent-platform-sets model to one target (video preferred when it
 * exists) — the dual model can come back later if it's actually wanted.
 *
 * Platform-native defaults (PRODUCT_STRATEGY.md §4): aspect is already
 * handled server-side (pickForPlatform picks the matching fan-out render);
 * caption tone/hashtags auto-adapt per platform via the existing
 * adapt-captions endpoint (now automatic, not a manual click); music
 * defaults per platformDefaults() and can be toggled per platform.
 */

interface SocialProfile {
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  activePageId?: string | null;
  availablePages?: { id: string; name: string }[];
}

interface PostResult {
  platform: string;
  status: "success" | "error";
  error?: string;
}

const ALL_PLATFORMS = Object.values(PLATFORM_FORMATS) as Array<{
  id: PlatformId;
  label: string;
}>;

export function PublishCanvas({
  workspaceSlug,
  campaignId,
  anchorId,
  workingImage,
  videoUrl,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  anchorId: string | null;
  workingImage: string | null;
  videoUrl: string | null;
}) {
  const hasVideo = !!videoUrl;
  const hasImage = !!workingImage;
  const [target, setTarget] = useState<"video" | "image">(
    hasVideo ? "video" : "image",
  );

  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [connectingMore, setConnectingMore] = useState(false);

  const [platforms, setPlatforms] = useState<string[]>([]);
  const [noMusicPlatforms, setNoMusicPlatforms] = useState<Set<string>>(
    new Set(),
  );
  const [caption, setCaption] = useState("");
  const [platformCaptions, setPlatformCaptions] = useState<
    Record<string, string>
  >({});
  const [adapting, setAdapting] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await api("/api/social/profiles", { workspaceSlug });
      if (res.ok) {
        const data = (await res.json()) as SocialProfile[];
        setProfiles(data);
        const fb = data.find((p) => p.platform === "facebook");
        if (fb?.activePageId) setFacebookPageId(fb.activePageId);
      }
    } finally {
      setLoadingProfiles(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    queueMicrotask(() => void fetchProfiles());
  }, [fetchProfiles]);

  useEffect(() => {
    api("/api/entitlements", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((e: { isPro?: boolean } | null) => setIsPro(e?.isPro ?? false))
      .catch(() => setIsPro(false));
  }, [workspaceSlug]);

  // Re-check on refocus — coming back from a native-OAuth or Ayrshare tab.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchProfiles();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchProfiles]);

  // Music defaults follow the target/platform selection — reset only when
  // switching target so a user's manual toggle survives caption edits etc.
  useEffect(() => {
    queueMicrotask(() =>
      setNoMusicPlatforms(
        new Set(platforms.filter((p) => !platformDefaults(p).music)),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => {
      const next = prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id];
      return next;
    });
    setNoMusicPlatforms((prev) => {
      if (prev.has(id) || platforms.includes(id)) return prev;
      // Newly-added platform: seed its music default.
      if (!platformDefaults(id).music) {
        const next = new Set(prev);
        next.add(id);
        return next;
      }
      return prev;
    });
  };

  const toggleMusic = (id: string) => {
    setNoMusicPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Auto-fit the caption per platform (AI) whenever the platform set or base
  // caption settles — "don't make the user manually configure this every
  // time." Debounced so it doesn't fire on every keystroke.
  const adaptCaptionsNow = useCallback(async () => {
    if (!caption.trim() || platforms.length === 0) return;
    setAdapting(true);
    try {
      const res = await api("/api/publish/adapt-captions", {
        method: "POST",
        body: JSON.stringify({ caption, platforms }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        captions?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !data.captions)
        throw new Error(data.error ?? "Could not adapt captions");
      setPlatformCaptions(data.captions);
    } catch {
      // Silent — the base caption still publishes fine without a tailored fit.
    } finally {
      setAdapting(false);
    }
  }, [caption, platforms, workspaceSlug]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (caption.trim() && platforms.length > 0) void adaptCaptionsNow();
    }, 900);
    return () => clearTimeout(t);
  }, [caption, platforms, adaptCaptionsNow]);

  const connectMeta = () => {
    window.location.href = `/api/social/connect/facebook?workspace=${workspaceSlug}`;
  };

  const connectMoreNetworks = async () => {
    setConnectingMore(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await api("/api/social/connect", { workspaceSlug });
      const data = (await res.json().catch(() => ({}))) as {
        connectUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.connectUrl)
        throw new Error(data.error ?? "Could not start the connection");
      if (tab) tab.location.href = data.connectUrl;
      else window.location.href = data.connectUrl;
    } catch (err) {
      tab?.close();
      toast.error((err as Error).message ?? "Could not connect — try again");
    } finally {
      setConnectingMore(false);
    }
  };

  const addHashtag = (raw: string) => {
    const tag = raw.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (!tag || hashtags.includes(tag) || hashtags.length >= 30) return;
    setHashtags((prev) => [...prev, tag]);
    setHashtagInput("");
  };

  const isConnected = (p: string) => profiles.some((pr) => pr.platform === p);
  const connectedPlatforms = ALL_PLATFORMS.filter((p) => isConnected(p.id));
  const fb = profiles.find((p) => p.platform === "facebook");
  const fbPages = fb?.availablePages ?? [];

  // The base caption's length against the tightest connected platform's limit
  // — a fallback warning only; each platform actually posts its own AI-fitted
  // caption (already within its limit) once adaptCaptionsNow has run.
  const minLimit =
    platforms.length > 0
      ? Math.min(...platforms.map((p) => PLATFORM_GUIDE[p]?.max ?? 2200))
      : 2200;
  const fullText =
    caption +
    (hashtags.length ? "\n\n" + hashtags.map((h) => `#${h}`).join(" ") : "");
  const charCount = fullText.length;
  const overLimit =
    charCount > minLimit && Object.keys(platformCaptions).length === 0;

  const musicSplit = useMemo(() => {
    const on = platforms.filter((p) => !noMusicPlatforms.has(p));
    const off = platforms.filter((p) => noMusicPlatforms.has(p));
    return { on, off };
  }, [platforms, noMusicPlatforms]);

  const handlePublish = async () => {
    if (platforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    if (scheduleMode === "later" && !scheduledAt) {
      toast.error("Pick a date and time to schedule");
      return;
    }
    setPublishing(true);
    try {
      const scheduledIso =
        scheduleMode === "later"
          ? new Date(scheduledAt).toISOString()
          : undefined;

      const send = async (
        list: string[],
        noMusic: boolean,
      ): Promise<PostResult[]> => {
        if (list.length === 0) return [];
        const body: Record<string, unknown> = {
          platforms: list,
          caption,
          hashtags,
        };
        if (target === "video") {
          body.preferVideo = true;
          body.campaignId = campaignId;
          body.noMusic = noMusic;
        } else if (anchorId) {
          body.assetId = anchorId;
        }
        const tailored = Object.fromEntries(
          list.filter((p) => platformCaptions[p]).map((p) => [p, platformCaptions[p]]),
        );
        if (Object.keys(tailored).length) body.platformCaptions = tailored;
        if (list.includes("facebook") && facebookPageId)
          body.facebookPageId = facebookPageId;
        if (scheduledIso) body.scheduledAt = scheduledIso;

        const res = await api("/api/publish", {
          method: "POST",
          body: JSON.stringify(body),
          workspaceSlug,
        });
        const data = (await res.json().catch(() => ({}))) as {
          platformResults?: Record<string, string>;
          errors?: Record<string, string>;
          error?: string;
        };
        if (!res.ok && !data.platformResults) {
          const msg = data.error ?? `Publish failed (${res.status})`;
          return list.map((platform) => ({
            platform,
            status: "error" as const,
            error: msg,
          }));
        }
        return [
          ...Object.keys(data.platformResults ?? {}).map((platform) => ({
            platform,
            status: "success" as const,
          })),
          ...Object.entries(data.errors ?? {}).map(([platform, error]) => ({
            platform,
            status: "error" as const,
            error,
          })),
        ];
      };

      const groups =
        target === "video"
          ? await Promise.all([
              send(musicSplit.on, false),
              send(musicSplit.off, true),
            ])
          : [await send(platforms, false)];
      setResults(groups.flat());
    } catch (err) {
      toast.error((err as Error).message ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  if (!campaignId || (!hasVideo && !hasImage)) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Send className="h-7 w-7 opacity-40" />
        <p className="text-sm">
          Generate an image or video first — publishing builds on the look
          you pick.
        </p>
      </div>
    );
  }

  if (results) {
    const failures = results.filter((r) => r.status === "error");
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
        <div
          className={`grid h-16 w-16 place-items-center rounded-full ${failures.length === 0 ? "bg-emerald-500/15" : "bg-amber-500/15"}`}
        >
          <Send
            className={`h-7 w-7 ${failures.length === 0 ? "text-emerald-500" : "text-amber-400"}`}
          />
        </div>
        <h2 className="text-lg font-semibold">
          {failures.length === 0
            ? "Published"
            : failures.length === results.length
              ? "Publishing failed"
              : "Partially published"}
        </h2>
        <div className="w-full space-y-1.5 text-left">
          {results.map((r) => {
            const meta = PLATFORM_FORMATS[r.platform as PlatformId];
            return (
              <div
                key={r.platform}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  r.status === "success"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-destructive/20 bg-destructive/5"
                }`}
              >
                {r.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <span className="flex-1 font-medium">
                  {meta?.label ?? r.platform}
                </span>
                {r.error && (
                  <span className="text-xs text-muted-foreground">
                    {r.error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setResults(null)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Edit & republish
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid h-full max-w-4xl grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* LEFT: connected platforms */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Send className="h-3.5 w-3.5" /> Publish to
        </div>
        {(hasVideo || hasImage) && hasVideo && hasImage && (
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setTarget("video")}
              className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs ${target === "video" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Play className="h-3 w-3" /> Video
            </button>
            <button
              type="button"
              onClick={() => setTarget("image")}
              className={`flex flex-1 items-center justify-center gap-1 border-l border-border px-2 py-1.5 text-xs ${target === "image" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ImageIcon className="h-3 w-3" /> Image
            </button>
          </div>
        )}

        {loadingProfiles ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : connectedPlatforms.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No accounts connected yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {connectedPlatforms.map((p) => {
              const on = platforms.includes(p.id);
              const musicOff = noMusicPlatforms.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors ${
                      on
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-background hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-primary" : "bg-border"}`}
                    />
                    {p.label}
                  </button>
                  {on && target === "video" && (
                    <button
                      type="button"
                      onClick={() => toggleMusic(p.id)}
                      title={
                        musicOff
                          ? "No music bed for this platform — click to add"
                          : "Music bed on — click to mute for this platform"
                      }
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      {musicOff ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Music2 className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-border" />

        {isPro === false ? (
          <Link
            href={`/${workspaceSlug}/settings/billing`}
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> Upgrade for X, LinkedIn,
            TikTok &amp; more
          </Link>
        ) : (
          <button
            type="button"
            onClick={connectMoreNetworks}
            disabled={connectingMore}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary disabled:opacity-60"
          >
            {connectingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            Connect more platforms
          </button>
        )}
        <button
          type="button"
          onClick={connectMeta}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Connect Facebook /
          Instagram (free)
        </button>

        {fbPages.length > 1 && platforms.includes("facebook") && (
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Facebook Page
            </label>
            <select
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {fbPages.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* RIGHT: caption, hashtags, schedule, publish */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Caption
            </label>
            <span
              className={`flex items-center gap-1.5 text-[11px] ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {adapting && <Loader2 className="h-3 w-3 animate-spin" />}
              {charCount.toLocaleString()} chars
              {platforms.length > 0 &&
                Object.keys(platformCaptions).length > 0 &&
                ` · fitted per platform`}
              {overLimit && ` · over ${minLimit} limit, waiting on AI fit`}
            </span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value);
              setPlatformCaptions({});
            }}
            placeholder="Write your caption — each connected platform gets its own AI-fitted tone and length automatically."
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Hashtags
          </label>
          <div className="flex min-h-[40px] flex-wrap gap-1.5 rounded-lg border border-border bg-background p-2 focus-within:border-primary/50">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs text-primary"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() =>
                    setHashtags((prev) => prev.filter((h) => h !== tag))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={hashtagInput}
              onChange={(e) =>
                setHashtagInput(e.target.value.replace(/[\s,]/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addHashtag(hashtagInput);
                }
              }}
              onBlur={() => hashtagInput && addHashtag(hashtagInput)}
              placeholder={hashtags.length === 0 ? "#tag — Enter to add" : ""}
              className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            When
          </label>
          <div className="mb-2 flex gap-2">
            {(["now", "later"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setScheduleMode(mode)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  scheduleMode === mode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "now" ? (
                  <>
                    <Send className="h-3.5 w-3.5" /> Post now
                  </>
                ) : (
                  <>
                    <Calendar className="h-3.5 w-3.5" /> Schedule
                  </>
                )}
              </button>
            ))}
          </div>
          {scheduleMode === "later" && (
            <input
              type="datetime-local"
              value={scheduledAt}
              // eslint-disable-next-line react-hooks/purity -- min datetime floor; impurity is harmless here
              min={new Date(Date.now() + 5 * 60 * 1000)
                .toISOString()
                .slice(0, 16)}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
          )}
        </div>

        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || platforms.length === 0}
          className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : scheduleMode === "later" ? (
            <Clock className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {publishing
            ? "Publishing…"
            : scheduleMode === "later"
              ? `Schedule · ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`
              : `Publish · ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
