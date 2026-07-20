"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Type,
  RotateCcw,
  Maximize2,
  Upload,
  X,
  Music,
  Film,
  ImageIcon,
  Loader2,
  Wand2,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { VideoWithMusic } from "@/components/compose/VideoWithMusic";
import AssetComments from "@/components/shared/AssetComments";
import { cn } from "@/lib/utils";
import { previewBoxClass } from "@/lib/util/aspect-classes";
import type { CaptionStyle } from "@/lib/composition/caption-presets";
import UpgradeModal from "@/components/billing/UpgradeModal";

/**
 * The style the auto-render uses when someone goes straight to Publish without
 * opening the compositor. Not a picker any more: choosing a style is what the
 * compositor's preset row is for, and this keeps the fast path fast.
 */
const DEFAULT_CAPTION_STYLE: CaptionStyle = "fade";

function RedoRow({
  label,
  onRedo,
  available,
}: {
  label: string;
  onRedo: () => void;
  available: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <div
          className={`w-1.5 h-1.5 rounded-full ${available ? "bg-green-400" : "bg-border"}`}
        />
        <span
          className={`text-sm ${available ? "text-foreground" : "text-muted-foreground/50"}`}
        >
          {label}
        </span>
      </div>
      <button
        onClick={onRedo}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
      >
        <RotateCcw className="w-3 h-3" /> Redo
      </button>
    </div>
  );
}

export default function Step4Compose() {
  const router = useRouter();
  const {
    generatedAssets,
    selectedAnchorId,
    expansions,
    setStep,
    completeStep,
    currentCampaignId,
    setCompositionId,
    workspaceSlug,
    composeCaption,
    setComposeCaption,
  } = useAppStore();

  // Caption lives in the store so it survives the round-trip to the
  // compositor (and step navigation); seed it from the AI script once.
  const caption = composeCaption;
  const setCaption = setComposeCaption;
  useEffect(() => {
    const script = useAppStore.getState().expansions.script?.content;
    if (!useAppStore.getState().composeCaption && script) {
      setComposeCaption(script);
    }
  }, [setComposeCaption]);
  const [isSaving, setIsSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFromKit, setLogoFromKit] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [rendering, setRendering] = useState(false);
  const [filmCompositionId, setFilmCompositionId] = useState<string | null>(
    null,
  );
  const [showUpgrade, setShowUpgrade] = useState(false);
  // What actually gets published: the mixed video film, or the still image.
  // Default to the film whenever a video exists, so the bare still image never
  // goes out when you meant the video.
  const [outputKind, setOutputKind] = useState<"image" | "video">(() =>
    useAppStore.getState().expansions.video?.status === "ready"
      ? "video"
      : "image",
  );

  // Pre-fill the logo from the saved brand kit so every film is brand-aware
  // by default; an upload in this step overrides it for this campaign.
  useEffect(() => {
    if (!workspaceSlug) return;
    api("/api/brand-kit", { workspaceSlug })
      .then((res) => (res.ok ? res.json() : null))
      .then((kit: { logo_url?: string | null } | null) => {
        if (kit?.logo_url) {
          setLogoUrl((current) => {
            if (current) return current;
            setLogoFromKit(true);
            return kit.logo_url!;
          });
        }
      })
      .catch(() => {});
  }, [workspaceSlug]);

  // The fast path's automatic render: no UI, fires from handleContinue when
  // someone publishes a film without opening the compositor. Music is always
  // layered in — turning it off, like restyling the caption, is a compositor job.
  const handleRenderFilm = async (): Promise<string | null> => {
    setRendering(true);
    try {
      const res = await api("/api/compositions/video", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          caption,
          captionStyle: DEFAULT_CAPTION_STYLE,
          useMusic: true,
          logoUrl,
        }),
        workspaceSlug,
      });
      if (res.status === 403) {
        setShowUpgrade(true);
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        compositionId?: string;
        error?: string;
      };
      if (!res.ok || !data.url)
        throw new Error(data.error ?? "Could not render your film");
      setFilmCompositionId(data.compositionId ?? null);
      setOutputKind("video");
      toast.success("Film rendered — your layers are mixed into one video.");
      return data.compositionId ?? null;
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not render your film");
      return null;
    } finally {
      setRendering(false);
    }
  };

  const anchor = generatedAssets.find((a) => a.id === selectedAnchorId);
  const video =
    expansions.video?.status === "ready" ? expansions.video.url : null;
  const music =
    expansions.music?.status === "ready" ? expansions.music.url : null;
  const hasScript = expansions.script?.status === "ready";

  // Upload the logo to storage so the FFmpeg render can layer it into the
  // film — an object URL only ever existed in this browser tab.
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: form,
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url)
        throw new Error(data.error ?? "Logo upload failed");
      setLogoUrl(data.url);
      setLogoFromKit(false);
      invalidateFilm();
      toast.success("Logo added — it'll be layered into your film");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Logo upload failed");
    } finally {
      setLogoUploading(false);
    }
  };

  // Advance to the Publish step (shared by both the image + film paths).
  const proceedToPublish = () => {
    completeStep(4);
    setStep(5);
    if (currentCampaignId && currentCampaignId !== "__new__") {
      api(`/api/campaigns/${currentCampaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ current_step: 5 }),
        workspaceSlug,
      }).catch(() => {});
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api("/api/compositions", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId ?? "demo",
          anchorAssetId: selectedAnchorId,
          format: "square",
          textOverlays: caption
            ? [{ text: caption, position: "bottom", style: {} }]
            : [],
          branding: { logo: !!logoUrl, primaryColor: false },
          caption,
          hashtags: [],
        }),
        workspaceSlug,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `Save failed (${res.status})`);
      }
      const composition = (await res.json()) as { id: string };
      setCompositionId(composition.id);
      toast.success("Composition ready");
      proceedToPublish();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not save composition");
    } finally {
      setIsSaving(false);
    }
  };

  // Editing the caption or logo invalidates a previously rendered film, so the
  // published film always matches what's on screen.
  const invalidateFilm = () => setFilmCompositionId(null);

  // Publish the chosen output. For a film, ensure it's rendered and carry THAT
  // composition forward — never silently fall back to the image.
  const handleContinue = async () => {
    if (outputKind === "video") {
      let compId = filmCompositionId;
      if (!compId) compId = await handleRenderFilm();
      if (!compId) return;
      setCompositionId(compId);
      proceedToPublish();
    } else {
      await handleSave();
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-5 md:gap-6 p-4 sm:p-6 overflow-y-auto">
      {/* ── Left: image + video + music ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Still and film STACK on their own rows (all screen sizes) so each —
            especially the film — gets the full column width. A larger video
            makes layering a logo or caption onto it far easier to see and
            manage than a cramped side-by-side card. */}
        <div className="grid gap-4">
          {/* Static image preview */}
          <div className="bg-card border border-border rounded-xl flex items-center justify-center p-4">
            {anchor ? (
              <div
                className={cn(
                  "relative bg-background shadow-2xl rounded-xl overflow-hidden mx-auto",
                  // The anchor's OWN ratio, not a hardcoded square. With
                  // object-cover a square box centre-cropped every portrait
                  // anchor, so this preview showed a shape that would never be
                  // published — and put the caption and logo in the wrong place.
                  previewBoxClass(anchor.aspectRatio),
                )}
              >
                <Image
                  src={anchor.url}
                  alt="Preview"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 448px"
                />
                {/* Caption overlay */}
                {caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-10">
                    <p className="text-white text-sm font-medium drop-shadow-md line-clamp-3">
                      {caption}
                    </p>
                  </div>
                )}
                {/* Logo — click to upload. The single logo control now that the
                    duplicate sidebar card is gone, so it carries that card's
                    spinner and brand-kit hint too. */}
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  title={
                    logoUploading
                      ? "Uploading your logo…"
                      : logoFromKit
                        ? "Your brand kit logo — click to replace it for this campaign"
                        : logoUrl
                          ? "Click to replace your logo"
                          : "Click to upload your logo"
                  }
                  className="absolute top-3 right-3 w-10 h-10 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow-md transition-all group"
                >
                  {logoUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-8 h-8 object-contain rounded"
                    />
                  ) : (
                    <>
                      <span className="text-black font-bold text-[10px] group-hover:hidden">
                        LOGO
                      </span>
                      <Upload className="w-4 h-4 text-primary hidden group-hover:block" />
                    </>
                  )}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm p-8">
                No anchor image selected.
              </p>
            )}
          </div>

          {/* Video player */}
          {video && (
            <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-xs font-semibold text-foreground">
                  Generated Video
                </span>
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Same 28rem height budget as the still, so the pair reads as one
                  row. Sized by max-* with auto dimensions rather than w-full: a
                  <video> is a replaced element, so it keeps its own aspect under
                  max constraints — the box hugs the clip instead of pillarboxing
                  it, and we never need to know the ratio here. */}
              <div className="flex-1 flex items-center justify-center bg-black p-2">
                <VideoWithMusic
                  videoUrl={video}
                  musicUrl={music}
                  className="max-w-full max-h-[28rem] w-auto h-auto"
                />
              </div>
              {music && (
                <p className="px-4 py-1.5 text-[11px] text-muted-foreground border-t border-border">
                  ♪ Playing with your music layered in — exactly how the
                  rendered film will sound.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Music player */}
        {music && (
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Music className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground shrink-0">
              Background Track
            </span>
            <audio src={music} controls className="flex-1 h-8" />
          </div>
        )}
      </div>

      {/* ── Right: controls ── */}
      <div className="w-full md:w-[22rem] md:shrink-0 flex flex-col gap-4">
        {/* Caption */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Type className="w-4 h-4 text-primary" /> Caption
          </div>
          <Textarea
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value);
              invalidateFilm();
            }}
            className="min-h-[100px] bg-background border-border text-sm resize-none"
            placeholder="Write a caption or generate one in Step 3…"
          />
        </div>

        {/* The one way to finish a film. Cinema mix used to sit here as a second,
            parallel render with its own caption-style picker and Render button;
            its styles are now presets inside the compositor, so there's a single
            path instead of two peers and no guess about which to use.

            Continuing straight to Publish still renders a film automatically
            with the default style (see handleContinue) — the compositor is for
            when you want to shape it, not a toll gate on publishing. */}
        {video && (
          <div className="bg-card border border-primary/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-foreground">
              <Wand2 className="w-4 h-4 text-primary" /> Finish with your brand
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Your footage, music, caption and logo — layered and ready. Pick a
              caption style, drag the logo anywhere, time the fades, then export
              a film ready to publish.
            </p>
            <Button
              onClick={() =>
                router.push(
                  `/${workspaceSlug}/compositor?campaign=${currentCampaignId}`,
                )
              }
              disabled={!currentCampaignId || currentCampaignId === "__new__"}
              className="w-full gap-2"
            >
              Open compositor <ArrowRight className="w-4 h-4" />
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Free — mixing what you&apos;ve already generated costs no credits.
            </p>
          </div>
        )}

        {/* Comments + AI suggestions on the anchor asset */}
        {anchor && workspaceSlug && (
          <div className="bg-card border border-border rounded-xl p-4">
            <AssetComments assetId={anchor.id} workspaceSlug={workspaceSlug} />
          </div>
        )}

        {/* The Logo card that used to live here was a second door onto the same
            handleLogoUpload as the LOGO button on the preview — and the two
            described different behaviour ("top-right of your film" vs the
            compositor's "drag it anywhere"). The preview button wins: it shows
            you where the logo actually lands. */}

        {/* Redo anything */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
            <RotateCcw className="w-4 h-4 text-primary" /> Redo anything
          </div>
          <div className="divide-y divide-border/50">
            <RedoRow
              label="Anchor image"
              onRedo={() => setStep(2)}
              available={!!anchor}
            />
            <RedoRow
              label="Video"
              onRedo={() => setStep(3)}
              available={!!video}
            />
            <RedoRow
              label="Music"
              onRedo={() => setStep(3)}
              available={!!music}
            />
            <RedoRow
              label="Caption"
              onRedo={() => setStep(3)}
              available={hasScript}
            />
          </div>
        </div>

        {/* What you're about to publish — only a choice when a video exists */}
        {video && (
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              You&apos;re publishing
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutputKind("video")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-colors ${
                  outputKind === "video"
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Film className="w-3.5 h-3.5" /> Video film
              </button>
              <button
                type="button"
                onClick={() => setOutputKind("image")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-colors ${
                  outputKind === "image"
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Image only
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {outputKind === "video"
                ? "Your video + music + caption + logo, mixed into one film."
                : "Just the still image with your caption — no video or music."}
            </p>
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={isSaving || rendering}
          className="w-full h-12 bg-primary text-white font-semibold text-base rounded-xl"
        >
          {rendering
            ? "Rendering film…"
            : isSaving
              ? "Saving…"
              : outputKind === "video"
                ? "Continue to Publish · 🎬 Video film"
                : video
                  ? "Continue to Publish · 📷 Image only"
                  : "Save & Continue to Publish"}
        </Button>
      </div>

      {/* ── Fullscreen video modal ── */}
      {isFullscreen && video && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <VideoWithMusic
            videoUrl={video}
            musicUrl={music}
            autoPlay
            className="max-w-full max-h-[90vh] rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-5 right-5 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Cinematic caption styles"
        blurb="Lower-third and cinematic crawl captions are available on Business and Agency plans."
      />
    </div>
  );
}
