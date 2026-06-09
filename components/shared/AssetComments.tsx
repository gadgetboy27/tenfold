"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface AssetComment {
  id: string;
  kind: "user" | "ai_suggestion";
  body: string;
  author_id: string | null;
  created_at: string;
}

interface AssetCommentsProps {
  assetId: string;
  workspaceSlug: string;
  /** Caption tone passed to the AI suggestion endpoint. */
  tone?: "professional" | "casual" | "playful";
  /** Target platform for AI-drafted captions. */
  platform?: string;
}

export default function AssetComments({
  assetId,
  workspaceSlug,
  tone = "professional",
  platform = "instagram",
}: AssetCommentsProps) {
  const [comments, setComments] = useState<AssetComment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/assets/${assetId}/comments`, {
        workspaceSlug,
      });
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Failed to load comments");
      const data = (await res.json()) as { comments: AssetComment[] };
      setComments(data.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [assetId, workspaceSlug]);

  useEffect(() => {
    // Async fetch on mount; setState only runs after the await resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function postComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await api(`/api/assets/${assetId}/comments`, {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({ body }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Failed to post");
      const { comment } = (await res.json()) as { comment: AssetComment };
      setComments((prev) => [...prev, comment]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  async function suggest() {
    if (suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await api(`/api/assets/${assetId}/comments/suggest`, {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({ tone, platform }),
      });
      if (res.status === 402)
        throw new Error("Not enough credits for an AI suggestion");
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Suggestion failed");
      const { comment } = (await res.json()) as { comment: AssetComment };
      setComments((prev) => [...prev, comment]);
      // Prefill the draft so the user can tweak and post it as their own.
      setDraft(comment.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="asset-comments">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Comments</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={suggest}
          disabled={suggesting}
          data-testid="ai-suggest"
        >
          {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          AI suggest
        </Button>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={
                  "rounded-md border px-3 py-2 text-sm " +
                  (c.kind === "ai_suggestion"
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card")
                }
              >
                {c.kind === "ai_suggestion" && (
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                    <Sparkles className="h-3 w-3" /> AI suggestion
                  </span>
                )}
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment or annotation…"
          className="min-h-[44px] flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              void postComment();
          }}
        />
        <Button
          size="icon"
          onClick={postComment}
          disabled={posting || !draft.trim()}
          aria-label="Post comment"
        >
          {posting ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}
