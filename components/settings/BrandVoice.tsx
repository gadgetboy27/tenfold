"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, MessageSquareQuote } from "lucide-react";
import toast from "react-hot-toast";

export default function BrandVoice() {
  const { workspaceSlug } = useAppStore();
  const [samplesText, setSamplesText] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api("/api/brand-voice", { workspaceSlug });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile: string | null;
          samples: string[];
        };
        if (!active) return;
        setProfile(data.profile);
        if (data.samples?.length) setSamplesText(data.samples.join("\n\n"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  const analyze = async () => {
    const samples = samplesText
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (samples.length === 0) {
      toast.error("Paste at least one of your posts");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api("/api/brand-voice", {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({ samples }),
      });
      const data = (await res.json()) as { profile?: string; error?: string };
      if (!res.ok || !data.profile)
        throw new Error(data.error ?? "Could not analyse voice");
      setProfile(data.profile);
      toast.success("Brand voice saved — captions will now sound like you");
    } catch (err) {
      toast.error((err as Error).message ?? "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-foreground">
        <MessageSquareQuote className="w-4 h-4 text-primary" /> Brand Voice
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Paste 3–5 of your best posts (separate each with a blank line). We learn
        your tone so generated captions sound like you — not generic AI.
      </p>

      <Textarea
        value={samplesText}
        onChange={(e) => setSamplesText(e.target.value)}
        disabled={loading || analyzing}
        placeholder={
          loading ? "Loading…" : "Post 1 text…\n\nPost 2 text…\n\nPost 3 text…"
        }
        className="min-h-[140px] text-sm"
      />

      <Button
        onClick={analyze}
        disabled={loading || analyzing}
        className="mt-3 gap-2"
      >
        {analyzing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {profile ? "Re-analyse & save" : "Analyse & save voice"}
      </Button>

      {profile && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Check className="h-3 w-3" /> Active voice profile
          </p>
          <p className="whitespace-pre-wrap text-xs text-foreground/90">
            {profile}
          </p>
        </div>
      )}
    </div>
  );
}
