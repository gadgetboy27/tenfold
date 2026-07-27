"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { MessageSquare, Loader2, Copy, RefreshCw, Check } from "lucide-react";
import { api } from "@/lib/api";
import {
  StudioSelect,
  type StudioOption,
} from "@/components/studio/StudioSelect";
import { PLATFORM_FORMATS, type PlatformId } from "@/lib/composition/formats";
import { InfoHint } from "@/components/ui/info-hint";

/**
 * Caption AI — a from-scratch, topic/prompt-driven caption generator.
 * Reuses the EXISTING `POST /api/jobs` (`type: "script_generation"`)
 * backend entirely (`lib/claude/script.ts`'s `generateScript` — full
 * platform-native voice / tone / brand-voice / banned-cliché prompt craft
 * already written) — this component is pure frontend, no new API route.
 * Deliberately does not import `lib/claude/script.ts` directly (it
 * constructs the Anthropic client at module scope) — same safe pattern as
 * every other Studio client component that touches Claude-backed features.
 */

type Tone = "professional" | "casual" | "playful";

const TONE_OPTIONS: StudioOption<Tone>[] = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "playful", label: "Playful" },
];

const PLATFORM_OPTIONS: StudioOption<PlatformId>[] = Object.values(
  PLATFORM_FORMATS,
).map((p) => ({ value: p.id, label: p.label }));

export function CaptionCanvas({
  workspaceSlug,
  campaignId,
  campaignName,
  initialTopic,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  campaignName: string;
  initialTopic: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [platform, setPlatform] = useState<PlatformId>("instagram");
  const [tone, setTone] = useState<Tone>("professional");
  const [generating, setGenerating] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!campaignId || !topic.trim() || generating) return;
    setGenerating(true);
    setCopied(false);
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          type: "script_generation",
          params: {
            imageDescription: topic.trim(),
            businessName: campaignName,
            platform,
            tone,
            maxWords: 60,
          },
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: string;
        error?: string;
      };
      if (!res.ok || !data.result) {
        throw new Error(
          res.status === 402
            ? "Not enough credits — this costs 1 credit."
            : (data.error ?? "Couldn't generate a caption"),
        );
      }
      setCaption(data.result);
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't generate a caption");
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!caption) return;
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!campaignId) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <MessageSquare className="h-7 w-7 opacity-40" />
        <p className="text-sm">
          Generate an image first — captions build on your campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid h-full max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
      {/* LEFT: inputs */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">Write a caption</h2>
          <p className="text-sm text-muted-foreground">
            An AI copywriter drafts one, tuned to your platform and tone.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            What&apos;s this about{" "}
            <InfoHint text="Prefilled from your image prompt, but edit it freely — this is what the caption is written about. Mentioning the offer or the audience gives you a sharper result than the scene description alone." />
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={4}
            placeholder="A coffee roastery overlooking the bay at golden hour…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Platform{" "}
              <InfoHint text="Each platform gets its own voice and length — LinkedIn runs longer and more measured, TikTok short and punchy. Pick where this post is actually going." />
            </label>
            <StudioSelect
              value={platform}
              onChange={setPlatform}
              options={PLATFORM_OPTIONS}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Tone{" "}
              <InfoHint text="The register of the writing. If you've set a brand voice in Settings, that overrides this pick." />
            </label>
            <StudioSelect
              value={tone}
              onChange={setTone}
              options={TONE_OPTIONS}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating || !topic.trim()}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Writing…
            </>
          ) : caption ? (
            <>
              <RefreshCw className="h-4 w-4" /> Regenerate
            </>
          ) : (
            <>
              <MessageSquare className="h-4 w-4" /> Generate caption
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-muted-foreground/70">
          1 credit per generation
        </p>
      </div>

      {/* RIGHT: result */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="text-xs font-medium text-muted-foreground">
          Result
        </span>
        {caption ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex-1 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-relaxed">
              {caption}
            </div>
            <button
              type="button"
              onClick={copy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy to clipboard"}
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageSquare className="h-7 w-7 opacity-30" />
            <p className="text-sm">Your caption appears here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
