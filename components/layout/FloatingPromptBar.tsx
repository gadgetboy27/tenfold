"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Sparkles, Globe, Loader2, AlertCircle, Lock } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import UpgradeModal from "@/components/billing/UpgradeModal";
import type { CampaignBrief } from "@/lib/claude/campaign-brief";

interface ModelOption {
  id: string;
  label: string;
  blurb: string;
  proOnly: boolean;
  locked: boolean;
}

const ASPECT_RATIOS = [
  { label: "1:1", value: "1:1" },
  { label: "4:5", value: "4:5" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
];
const STYLES = ["Photorealistic", "Illustration", "Cinematic", "3D"];

function analyzePrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return null;
  const hasSubject =
    [
      "person",
      "woman",
      "man",
      "founder",
      "ceo",
      "team",
      "product",
      "brand",
      "professional",
    ].some((w) => text.includes(w)) || wordCount >= 8;
  const hasSetting = [
    "office",
    "outdoor",
    "studio",
    "conference",
    "city",
    "room",
    "street",
    "urban",
    "rooftop",
  ].some((w) => text.includes(w));
  const hasStyle = [
    "cinematic",
    "professional",
    "editorial",
    "minimal",
    "bold",
    "warm",
    "dark",
    "bright",
    "moody",
    "photorealistic",
  ].some((w) => text.includes(w));
  const hasMood = [
    "inspiring",
    "exciting",
    "calm",
    "energetic",
    "confident",
    "aspirational",
    "premium",
    "dynamic",
    "powerful",
  ].some((w) => text.includes(w));
  const hasLighting = [
    "golden hour",
    "backlit",
    "rim light",
    "soft light",
    "studio lighting",
    "natural light",
    "neon",
    "sunset",
    "spotlight",
  ].some((w) => text.includes(w));
  const score = Math.min(
    100,
    Math.round(
      (hasSubject ? 90 : wordCount >= 5 ? 30 : 0) * 0.28 +
        (hasSetting ? 90 : 0) * 0.22 +
        (hasStyle ? 90 : 0) * 0.2 +
        (hasMood ? 90 : 0) * 0.18 +
        (hasLighting ? 90 : 0) * 0.12,
    ),
  );
  return { score };
}

export default function FloatingPromptBar() {
  const [mode, setMode] = useState<"describe" | "url">("describe");
  const [prompt, setPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [model, setModel] = useState("flux-pro");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    setCreditBalance,
    setIsGenerating,
    setGeneratedAssets,
    isGenerating,
    aspectRatio,
    style,
    setAspectRatio,
    setStyle,
    setStep,
    completeStep,
    setCampaignId,
    workspaceSlug,
    currentStep,
    setGenerationStage,
    setCampaignBrief,
    pendingBriefPrompt,
    setPendingBriefPrompt,
    campaignBrief,
    campaignName,
    generatedAssets,
  } = useAppStore();

  useEffect(() => {
    api("/api/models", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models?: ModelOption[] } | null) => {
        if (d?.models) setModels(d.models);
      })
      .catch(() => {});
  }, [workspaceSlug]);

  const STAGES = [
    { after: 0, label: "Submitting your prompt…" },
    { after: 3, label: "Waiting for GPU…" },
    { after: 7, label: "Painting your vision…" },
    { after: 14, label: "Adding fine details…" },
    { after: 22, label: "Almost there…" },
    { after: 35, label: "Finishing touches…" },
  ];

  const runGenerate = async (finalPrompt: string) => {
    setIsGenerating(true);
    try {
      const campRes = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          prompt: finalPrompt,
          aspectRatio,
          style,
          model,
          name: campaignName,
        }),
        workspaceSlug,
      });
      if (!campRes.ok) {
        const e = (await campRes.json().catch(() => ({}))) as {
          error?: string;
          issues?: string[];
          refinedPrompt?: string;
        };
        if (e.issues?.length) {
          toast.error(e.issues.join(" — "));
          if (e.refinedPrompt)
            toast(`Try: "${e.refinedPrompt}"`, { icon: "💡" });
        } else {
          throw new Error(e.error ?? `Campaign failed (${campRes.status})`);
        }
        setIsGenerating(false);
        return;
      }

      const camp = (await campRes.json()) as {
        campaignId: string;
        status: string;
      };
      const campaignId = camp.campaignId;
      setCampaignId(campaignId);
      setCampaignBrief(null);

      api("/api/credits/balance", { workspaceSlug })
        .then((r) => r.json())
        .then((d: { balance?: number }) => {
          if (typeof d.balance === "number") setCreditBalance(d.balance);
        })
        .catch(() => {});

      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 60)
          throw new Error("Generation timed out — please try again");
        await new Promise((r) => setTimeout(r, 1500));
        const elapsed = attempts * 1.5;
        const stage =
          [...STAGES].reverse().find((s) => elapsed >= s.after)?.label ??
          STAGES[0].label;
        setGenerationStage(stage, elapsed);

        const statusRes = await api(`/api/campaigns/${campaignId}`, {
          workspaceSlug,
        });
        if (!statusRes.ok) {
          const errBody = (await statusRes.json().catch(() => ({}))) as {
            error?: string;
          };
          if (statusRes.status === 401)
            throw new Error("Session expired — please refresh the page");
          throw new Error(
            errBody.error ?? `Status check failed (${statusRes.status})`,
          );
        }

        const campaign = (await statusRes.json()) as {
          status: string;
          assets: Array<{
            id: string;
            url: string;
            prompt: string;
            aspectRatio: string;
            style: string;
            createdAt: string;
            status: string;
            metadata?: { direction?: string; hd?: boolean };
          }>;
          jobs?: Array<{
            status: string;
            error_message: string | null;
            error_analysis: string | null;
          }>;
        };

        if (campaign.status === "ready") {
          // HD upscales are derived exports, not anchor candidates — keep them out of the picker.
          const readyAssets = campaign.assets.filter(
            (a) => a.url && !a.metadata?.hd,
          );
          if (readyAssets.length === 0)
            throw new Error(
              "Generation completed but no images returned. Please try again.",
            );
          setGeneratedAssets(
            readyAssets.map((a) => ({
              id: a.id,
              url: a.url,
              prompt: a.prompt || finalPrompt,
              aspectRatio: a.aspectRatio || aspectRatio,
              style: a.style || style,
              createdAt: a.createdAt,
              direction: a.metadata?.direction,
            })),
          );
          setIsGenerating(false);
          completeStep(1);
          setStep(2);
          toast.success("Images ready — pick your anchor");
          api("/api/credits/balance", { workspaceSlug })
            .then((r) => r.json())
            .then((d: { balance?: number }) => {
              if (typeof d.balance === "number") setCreditBalance(d.balance);
            })
            .catch(() => {});
        } else if (campaign.status === "failed") {
          const failedJob = campaign.jobs?.find((j) => j.status === "failed");
          const detail =
            failedJob?.error_analysis ?? failedJob?.error_message ?? null;
          throw new Error(
            detail ?? "Image generation failed — please try again",
          );
        } else {
          return poll();
        }
      };

      await poll();
    } catch (err: unknown) {
      setIsGenerating(false);
      toast.error((err as Error).message ?? "Generation failed");
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wordCount < 3) {
      setScore(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const result = analyzePrompt(prompt);
      setScore(result?.score ?? null);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [prompt]);

  // Auto-generate when a brief angle is selected — pendingBriefPrompt set by CampaignBriefPanel
  useEffect(() => {
    if (pendingBriefPrompt && !isGenerating) {
      const p = pendingBriefPrompt;
      setPendingBriefPrompt(null);
      runGenerate(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBriefPrompt]);

  const isSentinel = useAppStore.getState().currentCampaignId === "__new__";
  if (currentStep !== 1 && !isSentinel) return null;
  // Brief panel is showing — it has its own generate CTA; hide the prompt bar
  if (campaignBrief) return null;

  const isStrong = (score ?? 0) >= 70;
  const isFair = (score ?? 0) >= 45;

  // Initial state = no assets and not generating → show bar below the heading (center of page)
  const isInitialState = generatedAssets.length === 0 && !isGenerating;

  const handleDescribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    await runGenerate(prompt.trim());
  };

  const handleAnalyzeUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await api("/api/campaigns/analyze-url", {
        method: "POST",
        body: JSON.stringify({ url }),
        workspaceSlug,
      });
      const data = (await res.json()) as CampaignBrief & { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? `Analysis failed (${res.status})`);
      setCampaignBrief(data);
      toast.success("Brief ready — pick a campaign angle");
    } catch (err) {
      setAnalyzeError((err as Error).message ?? "Could not analyze that URL");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={`absolute left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4 ${
        isInitialState ? "top-[57%]" : "bottom-10"
      }`}
    >
      <div
        className="rounded-2xl border mt-2 focus-within:border-[#7C5CFC]/70 transition-colors duration-200"
        style={{
          background: "rgba(17,17,17,0.88)",
          backdropFilter: "blur(20px)",
          borderColor:
            mode === "describe" && isStrong
              ? "rgba(34,197,94,0.5)"
              : mode === "describe" && isFair
                ? "rgba(245,158,11,0.4)"
                : "rgba(124,92,252,0.35)",
          boxShadow:
            mode === "describe" && isStrong
              ? "0 0 0 1px rgba(34,197,94,0.15), 0 0 24px rgba(34,197,94,0.08), 0 20px 60px rgba(0,0,0,0.7)"
              : mode === "describe" && isFair
                ? "0 0 0 1px rgba(245,158,11,0.12), 0 0 24px rgba(245,158,11,0.06), 0 20px 60px rgba(0,0,0,0.7)"
                : "0 0 0 1px rgba(124,92,252,0.12), 0 0 24px rgba(124,92,252,0.06), 0 20px 60px rgba(0,0,0,0.7)",
          transition: "box-shadow 0.4s ease, border-color 0.2s ease",
        }}
      >
        {/* Mode tabs + controls */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 sm:px-4 pt-3 pb-2 border-b border-white/[0.06]">
          {/* Mode tabs */}
          <button
            type="button"
            onClick={() => setMode("describe")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "describe"
                ? "bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40"
                : "text-[#888] hover:text-[#F0F0F0] border border-transparent"
            }`}
          >
            <Sparkles className="w-3 h-3" /> Describe
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "url"
                ? "bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40"
                : "text-[#888] hover:text-[#F0F0F0] border border-transparent"
            }`}
          >
            <Globe className="w-3 h-3" /> From Website
          </button>

          {mode === "describe" && (
            <>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">
                Ratio
              </span>
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setAspectRatio(r.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${aspectRatio === r.value ? "bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40" : "text-[#888] hover:text-[#F0F0F0] border border-transparent"}`}
                  data-testid={`button-ratio-${r.value}`}
                >
                  {r.label}
                </button>
              ))}
              <div className="w-px h-4 bg-white/10 mx-1" />
              <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">
                Style
              </span>
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-all ${style === s ? "bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40" : "text-[#888] hover:text-[#F0F0F0] border border-transparent"}`}
                  data-testid={`button-style-${s}`}
                >
                  {s}
                </button>
              ))}
              {models.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10 mx-1" />
                  <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">
                    Model
                  </span>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      title={m.blurb}
                      onClick={() =>
                        m.locked ? setShowUpgrade(true) : setModel(m.id)
                      }
                      className={`px-2.5 py-1 rounded-md text-xs transition-all flex items-center gap-1 ${model === m.id && !m.locked ? "bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40" : "text-[#888] hover:text-[#F0F0F0] border border-transparent"} ${m.locked ? "opacity-70" : ""}`}
                      data-testid={`button-model-${m.id}`}
                    >
                      {m.locked && <Lock className="w-3 h-3" />}
                      {m.label}
                    </button>
                  ))}
                </>
              )}
              {score !== null && (
                <div className="ml-auto flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: isStrong
                        ? "#22C55E"
                        : isFair
                          ? "#F59E0B"
                          : "#EF4444",
                    }}
                  />
                  <span
                    className="text-[10px] font-mono"
                    style={{
                      color: isStrong
                        ? "#22C55E"
                        : isFair
                          ? "#F59E0B"
                          : "#EF4444",
                    }}
                  >
                    {score}/100
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Describe mode */}
        {mode === "describe" && (
          <form
            onSubmit={handleDescribeSubmit}
            className="flex items-center gap-3 px-4 py-3"
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A confident founder presenting at a tech conference, golden hour lighting, professional, aspirational..."
              className="flex-1 bg-transparent text-[#F0F0F0] placeholder-[#777] text-sm outline-none"
              data-testid="input-prompt"
            />
            <button
              id="tenfold-generate-btn"
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              data-testid="button-generate"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
                prompt.trim() && !isGenerating
                  ? "bg-gradient-to-r from-[#7C5CFC] to-[#9D84FD] text-white shadow-lg shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 hover:scale-[1.02]"
                  : "bg-white/5 text-[#444] cursor-not-allowed"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isGenerating ? "Generating..." : "Generate · 18 cr"}
            </button>
          </form>
        )}

        {/* URL mode */}
        {mode === "url" && (
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-[#7C5CFC] shrink-0" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyzeUrl()}
                placeholder="https://yourwebsite.com — we'll crawl it and build a campaign brief"
                className="flex-1 bg-transparent text-[#F0F0F0] placeholder-[#777] text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleAnalyzeUrl}
                disabled={!urlInput.trim() || analyzing}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
                  urlInput.trim() && !analyzing
                    ? "bg-gradient-to-r from-[#7C5CFC] to-[#9D84FD] text-white shadow-lg shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 hover:scale-[1.02]"
                    : "bg-white/5 text-[#444] cursor-not-allowed"
                }`}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…
                  </>
                ) : (
                  <>
                    <Globe className="w-3.5 h-3.5" /> Analyze
                  </>
                )}
              </button>
            </div>
            {analyzeError && (
              <div className="flex items-start gap-2 px-1 pt-1">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{analyzeError}</p>
              </div>
            )}
            {analyzing && (
              <p className="text-[11px] text-[#555] px-1">
                Crawling website and asking Claude to build your marketing brief
                — usually 15–25 seconds…
              </p>
            )}
          </div>
        )}
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Premium AI models"
        blurb="Typeset and Studio — our premium models for best-in-class text & design — are available on Business and Agency plans."
      />
    </motion.div>
  );
}
