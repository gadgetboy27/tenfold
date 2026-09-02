"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readProfilesResponse } from "@/lib/social/profiles-response";
import {
  withUserWording,
  type AdWatchResult,
} from "@/lib/composition/ad-notes";
import type { LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import {
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  Sparkles,
  Settings2,
  ChevronDown,
  Music2,
  VolumeX,
  Play,
  Image as ImageIcon,
  ShieldCheck,
  Eye,
  Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import { PLATFORM_FORMATS, type PlatformId } from "@/lib/composition/formats";
import { PLATFORM_GUIDE } from "@/lib/social/caption-guide";
import { thumbUrl } from "@/lib/images/thumb";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { useCompositorStore } from "@/store/useCompositorStore";
import { InfoHint } from "@/components/ui/info-hint";
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
 *
 * Approval state machine (PRODUCT_STRATEGY.md §4): a "member" role can
 * submit a campaign for review but /api/publish 403s them until an
 * owner/admin approves it (server-side gate — this UI is the workflow, not
 * the enforcement). Owner/admin see an inline approve/request-changes action
 * instead and can always self-approve.
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

/**
 * One collapsible section of the Publish rail.
 *
 * The rail stacks four questions — where it goes, what goes out, what it says,
 * and when — and showed all of them expanded at once, so the primary action
 * sat below more content than the pane could hold. Collapsing lets someone
 * settle a question and get it out of the way.
 *
 * `summary` is what makes that safe. A collapsed section that just says
 * "Caption" has hidden its own state, and publishing is the wrong place to
 * make someone re-open three panels to check what they're about to send — so
 * each one reports its answer in the header while shut.
 */
function Section({
  title,
  icon: Icon,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">
          {summary}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function PublishCanvas({
  workspaceSlug,
  campaignId,
  anchorId,
  workingImage,
  videoUrl,
  initialCaption = "",
}: {
  workspaceSlug: string;
  campaignId: string | null;
  anchorId: string | null;
  workingImage: string | null;
  videoUrl: string | null;
  /** Caption generated in the Caption section, if the user made one. */
  initialCaption?: string;
}) {
  const hasVideo = !!videoUrl;
  const hasImage = !!workingImage;
  // The Ad stage is mounted alongside this panel and owns the composition, so
  // its store is the truthful source for "what has the user actually built".
  const overlayCount = useCompositorStore((st) => st.doc?.layers.length ?? 0);
  /**
   * The layers on the ad. The SELECTOR returns the store's own array — a
   * stable reference — and nothing derives from it during render.
   *
   * Mapping inside the selector was the bug that took Studio down: zustand
   * compares results by reference, so a fresh array every call meant "changed"
   * every render, and React error #185 (max update depth) followed. A useMemo
   * fixed the loop but made the React Compiler bail on this component, so the
   * derivation moved to where it is actually needed — inside the request
   * handler, which runs on a click, not on every render.
   */
  const layers = useCompositorStore((st) => st.doc?.layers);
  const [target, setTarget] = useState<"video" | "image">(
    hasVideo ? "video" : "image",
  );

  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  const router = useRouter();

  // The outside-eye review (lib/claude/ad-watcher.ts). Held here rather than
  // fetched on mount: it costs credits, so it only runs when asked for.
  const [review, setReview] = useState<AdWatchResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  /** Per-note wording overrides — the "edit after" direction. */
  const [noteEdits, setNoteEdits] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState<number | null>(null);
  /** The re-exported cut, once an overlay has been burnt in. */
  const [appliedUrl, setAppliedUrl] = useState<string | null>(null);
  /** The re-exported cut, once an overlay has been burnt in. */

  const runReview = async () => {
    if (!campaignId || reviewing) return;
    setReviewing(true);
    try {
      const res = await api("/api/ad-watch", {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({
          campaignId,
          platforms,
          caption: caption.trim() || null,
          // Overlays already on the ad, so it doesn't propose what's there.
          // Derived here rather than memoized: this runs on a click.
          existingText: (layers ?? [])
            .map((l) => (l.kind === "text" ? l.text : null))
            .filter((t): t is string => !!t && t.trim().length > 0),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (AdWatchResult & { error?: string })
        | null;
      if (!res.ok) throw new Error(data?.error ?? "The review failed");
      setReview(data as AdWatchResult);
      setNoteEdits({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The review failed");
    } finally {
      setReviewing(false);
    }
  };

  // Which of the three questions is expanded. All three open by default —
  // collapsing is an escape hatch for a full rail, not a wall someone has to
  // click through on a first visit.
  const [openSections, setOpenSections] = useState({
    where: true,
    what: true,
    words: true,
  });
  const toggleSection = (k: "where" | "what" | "words") =>
    setOpenSections((prev) => ({ ...prev, [k]: !prev[k] }));

  const [platforms, setPlatforms] = useState<string[]>([]);
  const [noMusicPlatforms, setNoMusicPlatforms] = useState<Set<string>>(
    new Set(),
  );
  const [caption, setCaption] = useState(initialCaption);
  const [platformCaptions, setPlatformCaptions] = useState<
    Record<string, string>
  >({});
  // The user may generate a caption AFTER opening Publish. Adopt it only while
  // this field is still untouched — overwriting something they typed here
  // would be worse than making them paste it.
  const [captionTouched, setCaptionTouched] = useState(false);
  useEffect(() => {
    if (!captionTouched && initialCaption && initialCaption !== caption) {
      queueMicrotask(() => setCaption(initialCaption));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCaption, captionTouched]);
  const [adapting, setAdapting] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);

  const [role, setRole] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  /**
   * Burn one accepted overlay into the video.
   *
   * Free — the judgement was paid for when the notes were produced, and
   * charging again to act on them would tax the half that actually changes
   * anything. Sends the campaign to pending_review rather than publishing:
   * an automated edit to an advert is exactly what that gate is for.
   */
  const applyNote = async (index: number) => {
    const note = review?.notes[index];
    if (!campaignId || !note?.overlay || applying !== null) return;
    setApplying(index);
    try {
      const res = await api("/api/ad-watch/apply", {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({
          campaignId,
          overlays: [
            { proposal: note.overlay, text: noteEdits[index] ?? null },
          ],
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Couldn't apply it");
      toast.success("Applied — the new cut is waiting for your approval");
      // Show the new cut immediately; it is now the campaign's publish target.
      if (data?.url) setAppliedUrl(data.url);
      setApprovalStatus("pending_review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply it");
    } finally {
      setApplying(null);
    }
  };
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await api("/api/social/profiles", { workspaceSlug });
      if (res.ok) {
        const { profiles: data } = readProfilesResponse<SocialProfile>(
          await res.json(),
        );
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

  useEffect(() => {
    api("/api/workspaces/me", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => setRole(d?.role ?? null))
      .catch(() => setRole(null));
  }, [workspaceSlug]);

  const refreshApprovalStatus = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await api(`/api/campaigns/${campaignId}`, { workspaceSlug });
      if (res.ok) {
        const d = (await res.json()) as { approval_status?: string };
        setApprovalStatus(d.approval_status ?? "draft");
      }
    } catch {
      // Silent — the publish button falling back to "not approved yet" is
      // the safe default if this fetch fails.
    }
  }, [campaignId, workspaceSlug]);

  useEffect(() => {
    queueMicrotask(() => void refreshApprovalStatus());
  }, [refreshApprovalStatus]);

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

  /**
   * Both connect affordances go to Settings → Social, not straight at an OAuth
   * redirect.
   *
   * They used to launch the flow from here: Facebook by navigating the whole
   * page to /api/social/connect/facebook, and "more platforms" by opening a
   * blank tab and pointing it at Ayrshare. Two problems with doing it from the
   * Publish rail.
   *
   * It strands people on failure. A misconfigured redirect URI lands them on
   * Meta's bare "URL Blocked" page with their campaign gone from the screen
   * and no way back — which is exactly what happens on this deployment today.
   * The settings page can explain, show what the provider actually said, and
   * offer the next step; a Facebook error page can't.
   *
   * And it skips everything Settings knows: per-platform requirements, the
   * health check on existing grants, the Page picker, and the other eight
   * networks. Sending someone there is not a detour, it's the screen built for
   * this — the Publish rail's job is to say a connection is missing, not to be
   * a second, worse connect flow.
   */
  const goToConnections = () => {
    // Carry the campaign through so Settings can offer a way BACK.
    //
    // Studio holds the open project in memory, so navigating away drops it —
    // someone sent here from the Publish rail lost their campaign and returned
    // to a blank brief, which reads as "the app threw my work away". The id
    // round-trips and Settings links home via ?openProject, the same rehydrate
    // the Gallery and Productions pages use.
    const back = campaignId ? `?from=${encodeURIComponent(campaignId)}` : "";
    router.push(`/${workspaceSlug}/settings/social${back}`);
  };

  const runApprovalAction = async (
    action: "submit-review" | "approve" | "reject",
    successMessage: string,
  ) => {
    if (!campaignId) return;
    setApprovalActionLoading(true);
    try {
      const res = await api(`/api/campaigns/${campaignId}/${action}`, {
        method: "POST",
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        approval_status?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "That didn't go through");
      setApprovalStatus(data.approval_status ?? null);
      toast.success(successMessage);
    } catch (err) {
      toast.error((err as Error).message ?? "That didn't go through");
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const isReviewer = role === "owner" || role === "admin";
  const canPublish = isReviewer || approvalStatus === "approved";

  const addHashtag = (raw: string) => {
    const tag = raw.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (!tag || hashtags.includes(tag) || hashtags.length >= 30) return;
    setHashtags((prev) => [...prev, tag]);
    setHashtagInput("");
  };

  const isConnected = (p: string) => profiles.some((pr) => pr.platform === p);
  const connectedPlatforms = ALL_PLATFORMS.filter((p) => isConnected(p.id));
  /** The account name behind a connected platform, when we know it. */
  const accountFor = (platformId: string): string | null => {
    const pr = profiles.find((x) => x.platform === platformId);
    return pr?.profile_display_name ?? pr?.handle ?? null;
  };
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
    if (!canPublish) {
      toast.error(
        "This campaign needs owner/admin approval before it can be published",
      );
      return;
    }
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
          list
            .filter((p) => platformCaptions[p])
            .map((p) => [p, platformCaptions[p]]),
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
          code?: string;
        };
        // The one-video checkpoint. Nothing was sent to any network, so this
        // is not a per-platform failure — showing it as one error per selected
        // account would read as five things going wrong instead of one
        // question to answer. Abort the whole publish with the server's own
        // sentence, which names the count and the fix.
        if (data.code === "video_pick_required") {
          throw new Error(
            data.error ??
              "Pick which video publishes — the project strip below has a tick on each clip.",
          );
        }
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
          Generate an image or video first — publishing builds on the look you
          pick.
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
    // Single column: this renders in the generation rail (the ad itself owns
    // the centre), so the old sidebar+body split has nowhere to split into.
    // ONE place to scroll. The <aside> this renders into already scrolls
    // (Studio.tsx), and both panels below used to add `overflow-y-auto` of
    // their own — three nested scrollers, so the rail drew two extra
    // scrollbar tracks down the middle of its own content and each section
    // scrolled independently inside a box too short to hold it. Same fix as
    // the Compositor got in 05fbabb: let the shell scroll, and let the panels
    // be their natural height.
    <div className="flex flex-col gap-4">
      {/* 1 — where it goes */}
      <Section
        title="Publish to"
        icon={Send}
        open={openSections.where}
        onToggle={() => toggleSection("where")}
        summary={
          platforms.length === 0
            ? "No accounts picked"
            : `${platforms.length} account${platforms.length === 1 ? "" : "s"}`
        }
      >
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <InfoHint text="Pick every account this should go out to — one publish covers all of them. On video, the speaker icon beside a selected platform mutes the music bed just for that one (LinkedIn and Pinterest start muted, where silent autoplay is the norm)." />
          <span>One publish covers every account you pick.</span>
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
            <span className="flex items-center border-l border-border px-2">
              <InfoHint text="You made both a video and an image — this picks which one gets posted. It's one or the other, not both in the same publish." />
            </span>
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
                    <span className="min-w-0 flex-1 truncate">
                      {p.label}
                      {/* Which ACCOUNT, not just which network. "Facebook" on
                          its own doesn't say whose Page this posts to, and a
                          workspace that has reconnected to a different Page
                          looks identical to one that hasn't — you find out
                          after it has gone out. */}
                      {accountFor(p.id) && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          {accountFor(p.id)}
                        </span>
                      )}
                    </span>
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

        {/* ONE way through to connections.
            There were two buttons here — "Connect more platforms" and "Connect
            Facebook / Instagram (free)" — which since b6bfd06 both did the
            identical thing: navigate to Settings. Two controls with one
            behaviour is a choice the user has to make and cannot get right.
            The split also described the old world, where "more platforms"
            meant Ayrshare's paid hosted flow; that is switched off. */}
        {isPro === false && (
          <Link
            href={`/${workspaceSlug}/settings/billing`}
            className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> Upgrade for X, LinkedIn, TikTok
            &amp; more
          </Link>
        )}
        <button
          type="button"
          onClick={goToConnections}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {connectedPlatforms.length === 0
            ? "Connect an account"
            : "Manage connections"}
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
      </Section>

      {/* 2 — what actually goes out */}
      <Section
        title="What's going out"
        icon={Play}
        open={openSections.what}
        onToggle={() => toggleSection("what")}
        summary={
          approvalStatus && approvalStatus !== "approved"
            ? approvalStatus === "pending_review"
              ? "Awaiting review"
              : "Draft — needs approval"
            : target === "video"
              ? "Video"
              : "Image"
        }
      >
        {/* This screen had NO preview at all: you were one click from posting
            to real accounts and the thing being posted appeared nowhere on it.
            Shows whichever asset `target` will actually publish, so the picker
            above and this stay in step. */}
        {/* Prefer the freshly re-exported cut, so applying an overlay shows
            its result here immediately instead of leaving the old video on
            screen while the campaign already points at the new one. */}
        {(target === "video" ? (appliedUrl ?? videoUrl) : workingImage) && (
          <div className="flex gap-3 rounded-xl border border-border bg-background p-3">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-card">
              {target === "video" && (appliedUrl ?? videoUrl) ? (
                <video
                  key={appliedUrl ?? videoUrl ?? ""}
                  src={appliedUrl ?? videoUrl ?? undefined}
                  className="h-full w-full object-cover"
                  muted
                  loop
                  playsInline
                  autoPlay
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl(workingImage ?? "", { width: 200 })}
                  alt="What will be published"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <p className="text-xs font-medium">
                {target === "video"
                  ? "Publishing this video"
                  : "Publishing this image"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Goes out to every selected account with the caption below.
              </p>
              {/* Publishing an image posts the ANCHOR asset, not the composed
                  ad: /api/publish prefers a composition's output, but that
                  output only exists for video — the export pipeline renders
                  layered docs to MP4 via FFmpeg and there is no still-image
                  equivalent yet. So overlays built on the stage are silently
                  dropped from a photo post. Say so rather than let someone
                  publish believing their layers went with it. */}
              {target === "image" && overlayCount > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {overlayCount} overlay{overlayCount === 1 ? "" : "s"} on your
                  ad {overlayCount === 1 ? "is" : "are"} not included — a photo
                  post sends this image on its own. Make it a video to publish
                  the composed ad.
                </p>
              )}
              <a
                href={(target === "video" ? videoUrl : workingImage) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-[11px] text-primary hover:underline"
              >
                View full size
              </a>
            </div>
          </div>
        )}

        {approvalStatus && approvalStatus !== "approved" && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              {approvalStatus === "pending_review"
                ? isReviewer
                  ? "Waiting on your review before this can publish."
                  : "Submitted — waiting on an owner/admin to approve."
                : isReviewer
                  ? "Draft — approve it yourself, or wait for it to be submitted."
                  : "Draft — submit it for review before publishing."}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {!isReviewer && approvalStatus === "draft" && (
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() =>
                    runApprovalAction("submit-review", "Submitted for review")
                  }
                  className="rounded-md border border-amber-500/40 px-2 py-1 font-medium text-amber-700 hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-300"
                >
                  Submit for review
                </button>
              )}
              {isReviewer && approvalStatus === "pending_review" && (
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() =>
                    runApprovalAction("reject", "Sent back to draft")
                  }
                  className="flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 font-medium text-amber-700 hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-300"
                >
                  <Undo2 className="h-3 w-3" /> Request changes
                </button>
              )}
              {isReviewer && (
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => runApprovalAction("approve", "Approved")}
                  className="flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-1 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  <ShieldCheck className="h-3 w-3" /> Approve
                </button>
              )}
            </span>
          </div>
        )}
        {/* ── The outside-eye review ───────────────────────────────────────
            Lives here, beside what is actually going out, rather than in a
            tool of its own: the moment to hear "this ends with no CTA" is the
            moment before you send it, not three screens earlier. */}
        {target === "video" && videoUrl && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs font-medium">Outside-eye review</p>
              <button
                type="button"
                onClick={runReview}
                disabled={reviewing}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium hover:border-primary/50 disabled:opacity-60"
              >
                {reviewing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Watching…
                  </>
                ) : (
                  <>
                    {review ? "Review again" : "Review this ad"} ·{" "}
                    {CREDIT_COSTS.ad_watch} cr
                  </>
                )}
              </button>
            </div>

            {!review && !reviewing && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Shows the finished video to a reviewer who hasn&apos;t seen your
                brief, and reports what a stranger scrolling past would notice.
              </p>
            )}

            {review && (
              <div className="mt-2.5 flex flex-col gap-2">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {review.working}
                </p>
                {review.notes.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Nothing worth changing — it read well throughout.
                  </p>
                )}
                {review.notes.map((n, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {n.kind.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        at {n.atSec.toFixed(1)}s
                      </span>
                      {/* Confidence is shown, not hidden: only a HIGH note with
                          an overlay is safe to apply, and the user deserves to
                          know which of these the model is sure about. */}
                      <span
                        className={`ml-auto text-[10px] ${
                          n.confidence === "high"
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {n.confidence} confidence
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-foreground">
                      {n.observation}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {n.why}
                    </p>
                    {n.overlay && (
                      <div className="mt-2 border-t border-border pt-2">
                        <label className="mb-1 block text-[10px] text-muted-foreground">
                          Suggested wording — edit before you use it
                        </label>
                        {/* Editable, because the placement and styling are
                            usually the valuable part and the copy is what a
                            human most often wants to change. */}
                        <input
                          value={noteEdits[i] ?? n.overlay.text}
                          onChange={(e) =>
                            setNoteEdits((prev) => ({
                              ...prev,
                              [i]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-primary/50"
                        />
                        <div className="mt-1.5 flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground">
                            {
                              withUserWording(n.overlay, noteEdits[i]).text
                                .length
                            }{" "}
                            chars · {n.overlay.zone} · {n.overlay.font}
                            {n.overlay.scrim ? " · with scrim" : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() => applyNote(i)}
                            disabled={applying !== null}
                            className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                          >
                            {applying === i ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Rendering…
                              </>
                            ) : (
                              "Add to the video"
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  Adding one re-renders the video with that wording burnt in and
                  sends the new cut for your approval — the original is kept.
                </p>
              </div>
            )}
          </div>
        )}

        {approvalStatus === "approved" && (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Approved for publishing
          </div>
        )}
      </Section>

      {/* 3 — what it says, and when */}
      <Section
        title="Caption & timing"
        icon={Clock}
        open={openSections.words}
        onToggle={() => toggleSection("words")}
        summary={
          `${caption.trim() ? `${charCount} chars` : "No caption"}` +
          `${hashtags.length ? ` · ${hashtags.length} tag${hashtags.length === 1 ? "" : "s"}` : ""}` +
          ` · ${scheduleMode === "now" ? "Post now" : "Scheduled"}`
        }
      >
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Caption{" "}
              <InfoHint text="Write one caption here and it's automatically rewritten to each platform's tone and character limit before posting — you don't need to write several. Editing this resets those fitted versions." />
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
              setCaptionTouched(true);
              setPlatformCaptions({});
            }}
            placeholder="Write your caption — each connected platform gets its own AI-fitted tone and length automatically."
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Hashtags{" "}
            <InfoHint text="Added to the end of every caption, on every platform. Up to 30. Type without the # — press Enter to add each one." />
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
            When{" "}
            <InfoHint text="Post now goes out the moment you hit publish. Later hands the post to your scheduler — it publishes at the time you set, in your own timezone." />
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
      </Section>

      {/* The action stays OUTSIDE the sections. Collapsing one must never hide
          the button the whole screen exists for. */}
      <button
        type="button"
        onClick={handlePublish}
        disabled={publishing || platforms.length === 0 || !canPublish}
        title={
          canPublish
            ? undefined
            : "Needs owner/admin approval — submit it for review above"
        }
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
          : !canPublish
            ? "Awaiting approval"
            : scheduleMode === "later"
              ? `Schedule · ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`
              : `Publish · ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
