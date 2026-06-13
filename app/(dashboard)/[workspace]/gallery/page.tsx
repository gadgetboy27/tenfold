"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import {
  ImageIcon,
  Download,
  Maximize2,
  ArrowLeft,
  Loader2,
  Anchor,
} from "lucide-react";
import toast from "react-hot-toast";

interface GalleryAsset {
  id: string;
  url: string;
  type: string;
  campaign_id: string;
  metadata?: { direction?: string } | null;
  created_at: string;
}

export default function GalleryPage() {
  const params = useParams<{ workspace: string }>();
  const router = useRouter();
  const storeSlug = useAppStore((s) => s.workspaceSlug);
  const setCampaignId = useAppStore((s) => s.setCampaignId);
  const setGeneratedAssets = useAppStore((s) => s.setGeneratedAssets);
  const setAnchorId = useAppStore((s) => s.setAnchorId);
  const completeStep = useAppStore((s) => s.completeStep);
  const setStep = useAppStore((s) => s.setStep);
  const slug = storeSlug || params.workspace;

  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [reusing, setReusing] = useState<string | null>(null);

  // Reuse an existing image as the anchor of a NEW campaign — free, no
  // generation. Seeds the store and opens the campaign at the expand step.
  const reuseAsAnchor = async (assetId: string) => {
    setReusing(assetId);
    try {
      const res = await api("/api/campaigns/from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId }),
        workspaceSlug: slug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        campaignId?: string;
        asset?: {
          id: string;
          url: string;
          prompt: string;
          aspectRatio: string;
          style: string;
          createdAt: string;
          direction?: string;
        };
        error?: string;
      };
      if (!res.ok || !data.campaignId || !data.asset)
        throw new Error(data.error ?? "Couldn't reuse this image");

      setCampaignId(data.campaignId);
      setGeneratedAssets([data.asset]);
      setAnchorId(data.asset.id);
      completeStep(1);
      completeStep(2);
      setStep(3);
      toast.success(
        "Image set as anchor — build your campaign (no credits used).",
      );
      router.push(`/${slug}`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Couldn't reuse this image");
    } finally {
      setReusing(null);
    }
  };

  useEffect(() => {
    api("/api/gallery", { workspaceSlug: slug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { assets?: GalleryAsset[] } | null) =>
        setAssets(d?.assets ?? []),
      )
      .catch(() => toast.error("Couldn't load your gallery"))
      .finally(() => setLoading(false));
  }, [slug]);

  const download = async (a: GalleryAsset) => {
    try {
      const res = await fetch(a.url);
      const href = URL.createObjectURL(await res.blob());
      const el = document.createElement("a");
      el.href = href;
      el.download = `tenfold-${a.id}.jpg`;
      el.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(a.url, "_blank", "noopener");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/${slug}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to campaigns
          </Link>
          <h1 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" /> Gallery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every image you&apos;ve generated, kept and reusable — you already
            paid to create these. New generations are the only thing that costs
            credits.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading your creations…</span>
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No images yet — generate a campaign and they&apos;ll be saved here.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((a) => (
            <div
              key={a.id}
              className="relative aspect-square rounded-xl overflow-hidden border border-border group bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.metadata?.direction ?? "Generated image"}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              {a.metadata?.direction && (
                <span className="absolute top-2 left-2 bg-black/55 backdrop-blur-sm text-white text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {a.metadata.direction}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => reuseAsAnchor(a.id)}
                  disabled={reusing === a.id}
                  title="Start a new campaign with this image as the anchor — free"
                  className="px-2 h-7 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center gap-1 text-[10px] font-semibold disabled:opacity-60"
                >
                  {reusing === a.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Anchor className="w-3 h-3" />
                  )}
                  Use as anchor
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => window.open(a.url, "_blank", "noopener")}
                    title="View full size"
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => download(a)}
                    title="Download"
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-primary text-white flex items-center justify-center"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
