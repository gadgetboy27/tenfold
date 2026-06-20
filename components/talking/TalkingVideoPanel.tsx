"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Mic,
  Upload,
  Sparkles,
  Loader2,
  Check,
  ExternalLink,
  Lock,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import {
  VOICE_OPTIONS,
  STOCK_PRESENTERS,
  LANGUAGES,
  type PresenterSource,
} from "@/lib/fal/talking-video";

type Tone = "professional" | "casual" | "playful";
type Resolution = "480p" | "720p";
type Status = "idle" | "submitting" | "pending" | "ready" | "failed";

const TONES: Tone[] = ["professional", "casual", "playful"];
const LENGTHS = [10, 15, 20, 30];

// "Product / Founder Spoken Video" — the talking-spokesperson ad flow. Fully
// self-contained: resolves a presenter image (upload / generated / stock), lets
// the user draft AND edit the spoken script, then runs the dedicated
// /api/talking-video pipeline and polls for the finished clip.
export default function TalkingVideoPanel() {
  const ent = useEntitlements();
  const { generatedAssets, currentCampaignId, workspaceSlug, creditBalance, setCreditBalance } =
    useAppStore();

  // Persisted inputs — survive navigating to Compose and back.
  const talkingDraft = useAppStore((s) => s.talkingDraft);
  const patchTalking = useAppStore((s) => s.patchTalkingDraft);
  const {
    source,
    presenterUrl,
    voice,
    resolution,
    tone,
    seconds,
    language,
    name,
    description,
    featuresText,
    cta,
    script,
  } = talkingDraft;
  const setSource = (v: PresenterSource) => patchTalking({ source: v });
  const setPresenterUrl = (v: string) => patchTalking({ presenterUrl: v });
  const setVoice = (v: string) => patchTalking({ voice: v });
  const setResolution = (v: Resolution) => patchTalking({ resolution: v });
  const setTone = (v: Tone) => patchTalking({ tone: v });
  const setSeconds = (v: number) => patchTalking({ seconds: v });
  const setLanguage = (v: string) => patchTalking({ language: v });
  const setName = (v: string) => patchTalking({ name: v });
  const setDescription = (v: string) => patchTalking({ description: v });
  const setFeaturesText = (v: string) => patchTalking({ featuresText: v });
  const setCta = (v: string) => patchTalking({ cta: v });
  const setScript = (v: string) => patchTalking({ script: v });

  // Transient UI state — fine to reset on navigation.
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const isPro = ent?.isPro ?? false;
  const validCampaign =
    !!currentCampaignId &&
    currentCampaignId !== "__new__" &&
    currentCampaignId !== "demo";
  const busy = status === "submitting" || status === "pending";
  const featuresArray = () =>
    featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/talking-video/presenter", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      setPresenterUrl(data.url);
      toast.success("Presenter photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDraft() {
    if (!name.trim()) {
      toast.error("Add a product name first");
      return;
    }
    setDrafting(true);
    try {
      const res = await api("/api/talking-video/draft-script", {
        method: "POST",
        body: JSON.stringify({
          tone,
          targetSeconds: seconds,
          language,
          product: {
            name,
            description,
            features: featuresArray(),
            callToAction: cta,
          },
        }),
        workspaceSlug,
      });
      const data = (await res.json()) as { script?: string; error?: string };
      if (!res.ok || !data.script)
        throw new Error(data.error ?? "Could not draft a script");
      setScript(data.script);
      toast.success("Draft ready — edit it to say exactly what you want");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function poll(jobId: string) {
    const INTERVAL = 6000;
    const MAX = 6 * 60 * 1000;
    let waited = 0;
    while (waited < MAX) {
      await new Promise((r) => setTimeout(r, INTERVAL));
      waited += INTERVAL;
      setElapsed(Math.floor(waited / 1000));
      const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
      if (!res.ok) continue;
      const job = (await res.json()) as {
        status: string;
        outputUrls?: string[];
        errorMessage?: string | null;
      };
      if (job.status === "ready" && job.outputUrls?.[0]) {
        setVideoUrl(job.outputUrls[0]);
        setStatus("ready");
        toast.success("Spoken video ready");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.errorMessage ?? "Generation failed on the server");
      }
    }
    throw new Error("Timed out after 6 minutes — please retry");
  }

  async function handleGenerate() {
    if (!presenterUrl) {
      toast.error("Choose a presenter image first");
      return;
    }
    if (!name.trim() && !script.trim()) {
      toast.error("Add a product name (or write a script) first");
      return;
    }
    setStatus("submitting");
    setError("");
    setVideoUrl("");
    setElapsed(0);
    try {
      const res = await api("/api/talking-video", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          presenterImageUrl: presenterUrl,
          presenterSource: source,
          voice,
          resolution,
          tone,
          targetSeconds: seconds,
          language,
          product: {
            name,
            description,
            features: featuresArray(),
            callToAction: cta,
          },
          scriptOverride: script.trim() || undefined,
        }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        jobId?: string;
        creditCost?: number;
        error?: string;
      };
      if (!res.ok || !data.jobId)
        throw new Error(data.error ?? "Generation failed");
      setCreditBalance(creditBalance - (data.creditCost ?? 0));
      setStatus("pending");
      await poll(data.jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      setStatus("failed");
      toast.error(msg);
    }
  }

  const cost = CREDIT_COSTS.talking_video;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Product / Founder Spoken Video
            </h3>
            <p className="text-xs text-muted-foreground">
              A presenter speaks your ad on camera, lip-synced. Choose this when
              advertising a physical product or featuring a founder/presenter.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
          {cost} cr
        </span>
      </div>

      {!isPro && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2">
          <Lock className="w-3.5 h-3.5" />
          Spoken video is a Pro feature — upgrade to generate it.
        </div>
      )}

      {/* 1. Presenter */}
      <section className="space-y-2">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
          1 · Presenter
        </p>
        <div className="flex gap-1.5">
          {(["upload", "generate", "stock"] as PresenterSource[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-full border transition-colors capitalize",
                source === s
                  ? "border-primary/50 text-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              {s === "generate" ? "Use generated" : s}
            </button>
          ))}
        </div>

        {source === "upload" && (
          <label className="flex items-center gap-2 cursor-pointer text-xs text-primary">
            <span className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-2 hover:border-primary/50">
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload presenter photo"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
        )}

        {source === "generate" && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {generatedAssets.length === 0 && (
              <p className="col-span-full text-xs text-muted-foreground">
                No generated images yet — create some in the earlier steps.
              </p>
            )}
            {generatedAssets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPresenterUrl(a.url)}
                className={cn(
                  "relative aspect-square rounded-lg overflow-hidden ring-2 transition-all",
                  presenterUrl === a.url
                    ? "ring-primary"
                    : "ring-transparent hover:ring-primary/40",
                )}
              >
                <Image
                  src={a.url}
                  alt="Presenter option"
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </button>
            ))}
          </div>
        )}

        {source === "stock" && (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {STOCK_PRESENTERS.length === 0 ? (
              <p className="col-span-full text-xs text-muted-foreground">
                Stock presenters are coming soon — upload a photo or use a
                generated image for now.
              </p>
            ) : (
              STOCK_PRESENTERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresenterUrl(p.imageUrl)}
                  className={cn(
                    "relative aspect-square rounded-lg overflow-hidden ring-2 transition-all",
                    presenterUrl === p.imageUrl
                      ? "ring-primary"
                      : "ring-transparent hover:ring-primary/40",
                  )}
                >
                  <Image
                    src={p.imageUrl}
                    alt={p.label}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </button>
              ))
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Use a clear, front-facing photo of one person. For product ads, a shot
          of them holding or beside the product works best — it stays visible
          while they speak.
        </p>
        {presenterUrl && (
          <p className="flex items-center gap-1 text-[11px] text-success">
            <Check className="w-3 h-3" /> Presenter selected
          </p>
        )}
      </section>

      {/* 2. Product */}
      <section className="space-y-2">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
          2 · What are you advertising?
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product or offer name (required)"
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two lines on what it is and who it is for"
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          placeholder="Key selling points — one per line"
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <input
          type="text"
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          placeholder="Call to action (e.g. Shop now at example.com)"
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </section>

      {/* 3. The spoken script — draft + EDIT (this is how you control speech) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            3 · What they say
          </p>
          <button
            type="button"
            onClick={handleDraft}
            disabled={drafting}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50"
          >
            {drafting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {script ? "Re-draft with AI" : "Draft with AI"}
          </button>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="The exact words your presenter will speak. Draft with AI, then edit — or just type your own."
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-[11px] text-muted-foreground">
          This is exactly what gets spoken. Edit it freely — leave blank to let
          AI write it from the details above. ~{Math.round(seconds * 2.5)} words
          fits {seconds}s.
        </p>
      </section>

      {/* 4. Options */}
      <section className="space-y-3">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
          4 · Language, voice &amp; format
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Language
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">
            AI writes &amp; speaks the ad in this language
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VOICE_OPTIONS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVoice(v.id)}
              title={v.blurb}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                voice === v.id
                  ? "border-primary/50 text-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border capitalize transition-colors",
                  tone === t
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {LENGTHS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeconds(s)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  seconds === s
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {s}s
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(["480p", "720p"] as Resolution[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(r)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  resolution === r
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Result / errors */}
      {status === "ready" && videoUrl && (
        <div className="space-y-2">
          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg aspect-video bg-black"
          />
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
          >
            <ExternalLink className="w-3 h-3" />
            Open video in new tab
          </a>
        </div>
      )}
      {status === "failed" && error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          {error}
        </p>
      )}

      {/* Generate */}
      <Button
        onClick={handleGenerate}
        disabled={busy || !isPro || !validCampaign}
        className="w-full gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "pending"
          ? `Generating… ${elapsed}s (script → voice → lip-sync)`
          : status === "submitting"
            ? "Starting…"
            : `Generate spoken video · ${cost} cr`}
      </Button>
      {!validCampaign && (
        <p className="text-[11px] text-muted-foreground text-center">
          Save or open a campaign first to generate.
        </p>
      )}
    </div>
  );
}
