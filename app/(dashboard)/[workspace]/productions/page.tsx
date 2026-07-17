"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { openCampaignForPublish } from "@/lib/campaign/publish-nav";
import { downloadAsset } from "@/lib/util/download-asset";
import { Film, Download, ArrowLeft, Loader2, Send } from "lucide-react";
import toast from "react-hot-toast";

interface Production {
  id: string;
  url: string;
  campaignId: string;
  campaignName: string;
  aspect: string | null;
  createdAt: string;
}

/**
 * Finished, publish-ready videos (the compositor's branded exports) — the
 * completed products, separate from the raw-image Gallery. Each can be
 * downloaded, or sent straight into the Publish flow to post to social.
 */
export default function ProductionsPage() {
  const params = useParams<{ workspace: string }>();
  const router = useRouter();
  const storeSlug = useAppStore((s) => s.workspaceSlug);
  const slug = storeSlug || params.workspace;

  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    api("/api/productions", { workspaceSlug: slug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { productions?: Production[] } | null) =>
        setItems(d?.productions ?? []),
      )
      .catch(() => toast.error("Couldn't load your productions"))
      .finally(() => setLoading(false));
  }, [slug]);

  const download = (p: Production) =>
    downloadAsset({
      assetId: p.id,
      url: p.url,
      filename: `${p.campaignName.replace(/[^\w-]+/g, "-")}-${p.id}.mp4`,
      workspaceSlug: slug,
    });

  // Open this production's campaign at the Publish step and go — the publish
  // flow posts the campaign's finished video to social, as before.
  const publish = async (p: Production) => {
    setPublishing(p.id);
    const ok = await openCampaignForPublish(p.campaignId, slug, p.url);
    if (!ok) {
      toast.error("Couldn't open publish — please try again.");
      setPublishing(null);
      return;
    }
    router.push(`/${slug}`);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link
          href={`/${slug}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to campaigns
        </Link>
        <h1 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
          <Film className="w-6 h-6 text-primary" /> Productions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your finished, publish-ready videos. Download one to your computer, or
          send it straight to your social platforms.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading your productions…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No finished videos yet — export one from the compositor and it&apos;ll
          appear here, ready to publish.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-border bg-card overflow-hidden flex flex-col"
            >
              <video
                src={p.url}
                controls
                preload="metadata"
                className="w-full aspect-video bg-black object-contain"
              />
              <div className="p-3 flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {p.campaignName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.aspect ? `${p.aspect} · ` : ""}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => publish(p)}
                    disabled={publishing === p.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {publishing === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Publish
                  </button>
                  <button
                    onClick={() => download(p)}
                    title="Download MP4"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary/50"
                  >
                    <Download className="w-3.5 h-3.5" /> MP4
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
