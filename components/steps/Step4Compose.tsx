"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Type,
  Palette,
  RotateCcw,
  Maximize2,
  Upload,
  X,
  Music,
  Film,
  Lock,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import AssetComments from "@/components/shared/AssetComments";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import UpgradeModal from "@/components/billing/UpgradeModal";

// Mirror of the server CAPTION_PRESETS (kept inline — the composition lib imports
// node:child_process and can't be pulled into a client component).
const CINEMA_PRESETS = [
  { id: "none", label: "None", proOnly: false },
  { id: "fade", label: "Fade", proOnly: false },
  { id: "lower_third", label: "Lower third", proOnly: true },
  { id: "crawl", label: "Cinematic crawl", proOnly: true },
] as const;
type CinemaStyle = (typeof CINEMA_PRESETS)[number]["id"];

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
  const {
    generatedAssets,
    selectedAnchorId,
    expansions,
    setStep,
    completeStep,
    currentCampaignId,
    setCompositionId,
    workspaceSlug,
  } = useAppStore();

  const ent = useEntitlements();
  const [caption, setCaption] = useState(expansions.script?.content || "");
  const [isSaving, setIsSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Cinema mix (non-destructive: re-render with different layers anytime)
  const [captionStyle, setCaptionStyle] = useState<CinemaStyle>("fade");
  const [useMusic, setUseMusic] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [filmUrl, setFilmUrl] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleRenderFilm = async () => {
    setRendering(true);
    try {
      const res = await api("/api/compositions/video", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          caption,
          captionStyle,
          useMusic,
        }),
        workspaceSlug,
      });
      if (res.status === 403) {
        setShowUpgrade(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url)
        throw new Error(data.error ?? "Could not render your film");
      setFilmUrl(data.url);
      toast.success("Film rendered — your layers are mixed into one video.");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not render your film");
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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUrl(URL.createObjectURL(file));
    toast.success("Logo added");
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
      completeStep(4);
      setStep(5);
      if (currentCampaignId && currentCampaignId !== "__new__") {
        api(`/api/campaigns/${currentCampaignId}`, {
          method: "PATCH",
          body: JSON.stringify({ current_step: 5 }),
          workspaceSlug,
        }).catch(() => {});
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Could not save composition");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-5 md:gap-6 p-4 sm:p-6 overflow-y-auto">
      {/* ── Left: image + video + music ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Static image preview */}
        <div className="bg-card border border-border rounded-xl flex items-center justify-center p-4">
          {anchor ? (
            <div className="relative w-full max-w-xs aspect-square bg-background shadow-2xl rounded-xl overflow-hidden mx-auto">
              <Image
                src={anchor.url}
                alt="Preview"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 320px"
              />
              {/* Caption overlay */}
              {caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-10">
                  <p className="text-white text-sm font-medium drop-shadow-md line-clamp-3">
                    {caption}
                  </p>
                </div>
              )}
              {/* Logo — click to upload */}
              <button
                onClick={() => logoInputRef.current?.click()}
                title="Click to upload your logo"
                className="absolute top-3 right-3 w-10 h-10 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow-md transition-all group"
              >
                {logoUrl ? (
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
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
            <video src={video} controls className="w-full max-h-64 bg-black" />
          </div>
        )}

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
            onChange={(e) => setCaption(e.target.value)}
            className="min-h-[100px] bg-background border-border text-sm resize-none"
            placeholder="Write a caption or generate one in Step 3…"
          />
        </div>

        {/* Cinema mix — layer existing video + music + caption into one film */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-foreground">
            <Film className="w-4 h-4 text-primary" /> Cinema mix
          </div>
          {video ? (
            <>
              <p className="text-[11px] text-green-400/90 mb-3">
                ✓ Mixes your existing video, music & caption — no extra credits.
                New generations (Steps 2–3) are what cost credits.
              </p>

              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Caption style
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CINEMA_PRESETS.map((p) => {
                  const locked = p.proOnly && !ent?.isPro;
                  const active = captionStyle === p.id && !locked;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        locked ? setShowUpgrade(true) : setCaptionStyle(p.id)
                      }
                      className={`px-2.5 py-1 rounded-md text-xs transition-all flex items-center gap-1 border ${active ? "bg-primary/20 text-primary border-primary/40" : "text-muted-foreground hover:text-foreground border-transparent"} ${locked ? "opacity-70" : ""}`}
                    >
                      {locked && <Lock className="w-3 h-3" />}
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {music && (
                <label className="flex items-center gap-2 mb-3 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMusic}
                    onChange={(e) => setUseMusic(e.target.checked)}
                    className="accent-primary"
                  />
                  Add background music layer
                </label>
              )}

              <Button
                onClick={handleRenderFilm}
                disabled={rendering}
                variant="outline"
                className="w-full gap-2"
              >
                {rendering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Rendering film…
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" /> Render film
                  </>
                )}
              </Button>

              {filmUrl && (
                <div className="mt-3">
                  <video
                    src={filmUrl}
                    controls
                    className="w-full rounded-lg bg-black"
                  />
                  <a
                    href={filmUrl}
                    target="_blank"
                    rel="noopener"
                    className="mt-1.5 inline-block text-xs text-primary hover:underline"
                  >
                    Download film
                  </a>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Generate a video in Step 3 to mix it with music and a caption
              here.
            </p>
          )}
        </div>

        {/* Comments + AI suggestions on the anchor asset */}
        {anchor && workspaceSlug && (
          <div className="bg-card border border-border rounded-xl p-4">
            <AssetComments assetId={anchor.id} workspaceSlug={workspaceSlug} />
          </div>
        )}

        {/* Logo upload */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Palette className="w-4 h-4 text-primary" /> Logo
          </div>
          <button
            onClick={() => logoInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
            ) : (
              <>
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Upload your logo — shown in top-right of ad
                </span>
              </>
            )}
          </button>
        </div>

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

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-12 bg-primary text-white font-semibold text-base rounded-xl"
        >
          {isSaving ? "Saving…" : "Save & Continue to Publish"}
        </Button>
      </div>

      {/* ── Fullscreen video modal ── */}
      {isFullscreen && video && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <video
            src={video}
            controls
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
        blurb="Lower-third and Star-Wars-style crawl captions are available on Business and Agency plans."
      />
    </div>
  );
}
