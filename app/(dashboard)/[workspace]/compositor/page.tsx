"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Clapperboard,
  Film,
  ImageIcon,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Compositor } from "@/components/compositor/Compositor";
import { fetchCompositionDoc } from "@/components/compositor/export-client";
import { brandKitLayers, pickKitLogo } from "@/lib/composition/brand-apply";
import type { CompositionAspect } from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";
import { useAppStore } from "@/store/useAppStore";

interface CampaignAsset {
  type: string;
  url: string;
  created_at: string;
}

function latest(assets: CampaignAsset[], type: string): string | null {
  const match = assets
    .filter((a) => a.type === type)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return match[0]?.url ?? null;
}

function videoMeta(
  src: string,
): Promise<{ duration: number; aspect: CompositionAspect }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const ratio = v.videoWidth / Math.max(1, v.videoHeight);
      resolve({
        duration: Number.isFinite(v.duration) ? v.duration : 10,
        aspect: ratio > 1.2 ? "16:9" : ratio < 0.83 ? "9:16" : "1:1",
      });
    };
    v.onerror = () => reject(new Error("Could not read the video"));
    v.src = src;
  });
}

function logoWidth(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth || null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Compositor page. Two modes:
 * - Lab (no query param): pick local files, preview-only experiments.
 * - Campaign ("?campaign=<id>", via "Finish with your brand" in Step 4): the
 *   campaign's footage is the background, the brand kit is pre-applied, and
 *   export persists a composed_video asset that the existing publish step
 *   picks up automatically.
 */
export default function CompositorPage() {
  const params = useParams<{ workspace: string }>();
  const router = useRouter();
  const doc = useCompositorStore((s) => s.doc);
  const load = useCompositorStore((s) => s.load);
  const reset = useCompositorStore((s) => s.reset);
  const setStep = useAppStore((s) => s.setStep);
  const completeStep = useAppStore((s) => s.completeStep);

  const videoRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [initialising, setInitialising] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  // Campaign mode init — read ?campaign from the URL (no useSearchParams, so
  // the page needs no Suspense boundary) and build the branded default doc.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("campaign");
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount init from the URL
    setCampaignId(id);
    setInitialising(true);
    (async () => {
      try {
        const res = await api(`/api/campaigns/${id}`, {
          workspaceSlug: params.workspace,
        });
        if (!res.ok) throw new Error("Campaign not found");
        const campaign = (await res.json()) as {
          assets?: CampaignAsset[];
          expansion_data?: {
            video?: { url?: string | null };
            music?: { url?: string | null };
          };
          latestCompositionId?: string | null;
        };
        const assets = campaign.assets ?? [];
        // Music is needed for a re-export whether or not we restore a save.
        setAudioUrl(
          latest(assets, "audio") ??
            campaign.expansion_data?.music?.url ??
            null,
        );

        // Restore a previously saved layered composition (with its per-format
        // overrides) if one exists — otherwise build a fresh branded doc below.
        if (campaign.latestCompositionId) {
          const saved = await fetchCompositionDoc(
            campaign.latestCompositionId,
            params.workspace,
          );
          if (saved) {
            load(saved);
            return;
          }
        }

        // Same source order as Step 4's preview: the assets table first, then
        // the campaign's expansion_data (older/demo campaigns only have the
        // latter) — so the two pages can never disagree about a video.
        const videoUrl =
          latest(assets, "video") ??
          campaign.expansion_data?.video?.url ??
          null;
        if (!videoUrl) throw new Error("Generate a video first (Step 3).");

        const meta = await videoMeta(videoUrl);
        const kitRes = await api("/api/brand-kit", {
          workspaceSlug: params.workspace,
        });
        const kit = kitRes.ok ? await kitRes.json() : {};
        const logoSrc = pickKitLogo(kit);
        // The Step 4 caption (AI script draft) carries through to the
        // compositor as the main text layer.
        const layers = brandKitLayers(
          kit,
          meta.aspect,
          meta.duration,
          logoSrc ? await logoWidth(logoSrc) : null,
          useAppStore.getState().composeCaption || null,
        );

        load({
          id: crypto.randomUUID(),
          aspect: meta.aspect,
          background: {
            kind: "video",
            src: videoUrl,
            durationSec: Math.min(600, meta.duration),
          },
          layers,
        });
      } catch (err) {
        toast.error((err as Error).message ?? "Could not open the campaign");
      } finally {
        setInitialising(false);
      }
    })();
    return () => reset();
  }, [params.workspace, load, reset]);

  const continueToPublish = () => {
    // Land directly on the Publish step (the social send-off area), not Review.
    completeStep(4);
    completeStep(5);
    setStep(6);
    router.push(`/${params.workspace}`);
  };

  // Back to the compose screen (Step 4) to pick a different video — the brand
  // work here is discarded, but the campaign's assets are untouched.
  const backToCompose = () => {
    setStep(4);
    router.push(`/${params.workspace}`);
  };

  // Real download-to-file (fetch → blob) so the browser saves the MP4 instead
  // of just opening/playing it in a tab.
  const downloadFile = async (url: string) => {
    try {
      const res = await fetch(url);
      const href = URL.createObjectURL(await res.blob());
      const el = document.createElement("a");
      el.href = href;
      el.download = `tenfold-${Date.now()}.mp4`;
      el.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

  const startLab = (file: File, kind: "video" | "image") => {
    load({
      id: crypto.randomUUID(),
      aspect: "9:16",
      background: {
        kind,
        src: URL.createObjectURL(file),
        ...(kind === "image" ? { durationSec: 10 } : {}),
      },
      layers: [],
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">
            {campaignId ? "Finish with your brand" : "Compositor lab"}
          </h1>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            Beta
          </span>
        </div>
        {campaignId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={backToCompose}
            className="gap-1.5 text-xs"
            title="Go back to Compose to pick a different video"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Compose
          </Button>
        ) : (
          doc && (
            <Button
              size="sm"
              variant="outline"
              onClick={reset}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </Button>
          )
        )}
      </div>

      {exportedUrl && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm">
            🎬 Your finished film is rendered and saved — find it any time in{" "}
            <Link
              href={`/${params.workspace}/productions`}
              className="font-medium text-primary underline"
            >
              Productions
            </Link>
            , or send it off now.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={exportedUrl}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-primary/50"
            >
              Preview
            </a>
            <button
              onClick={() => downloadFile(exportedUrl)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm hover:border-primary/50"
            >
              <Download className="h-3.5 w-3.5" /> Download MP4
            </button>
            <Button size="sm" onClick={continueToPublish} className="gap-1.5">
              Continue to publish <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {initialising ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your footage and brand kit…</span>
        </div>
      ) : doc ? (
        <div className="min-h-0 flex-1">
          <Compositor
            campaignId={campaignId}
            audioUrl={audioUrl}
            onExported={setExportedUrl}
          />
        </div>
      ) : campaignId ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            This campaign has no video yet — generate one in Step 3 first.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <p className="mb-1 font-semibold">Pick your background footage</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Choose a video or image from this device, then layer your logo and
              captions on top.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() => videoRef.current?.click()}
                className="gap-2"
              >
                <Film className="h-4 w-4" /> Video
              </Button>
              <Button
                variant="outline"
                onClick={() => imageRef.current?.click()}
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4" /> Image
              </Button>
            </div>
            <input
              ref={videoRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startLab(f, "video");
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startLab(f, "image");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
