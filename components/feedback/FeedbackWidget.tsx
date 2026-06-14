"use client";

import { useState } from "react";
import { MessageSquarePlus, X, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import toast from "react-hot-toast";

/** Floating "Feedback" button → small modal → emails admin@tenfold.nz via Resend. */
export default function FeedbackWidget() {
  const workspaceSlug = useAppStore((s) => s.workspaceSlug);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (message.trim().length < 3) {
      toast.error("Tell us a little more.");
      return;
    }
    setSending(true);
    try {
      const res = await api("/api/feedback", {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({
          message,
          email: email.trim() || undefined,
          page:
            typeof window !== "undefined"
              ? window.location.pathname
              : undefined,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Couldn't send feedback");
      }
      toast.success("Thanks! Your feedback is on its way.");
      setMessage("");
      setEmail("");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't send feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Send feedback"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[20rem] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">
              Share feedback
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-secondary"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            What&apos;s working, what isn&apos;t, or what you&apos;d love to
            see?
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your thoughts…"
            className="min-h-[90px] text-sm bg-background border-border resize-none mb-2"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional, so we can reply)"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 mb-3 outline-none focus:border-primary/50"
          />
          <Button
            onClick={send}
            disabled={sending}
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-white"
            size="sm"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Send feedback
          </Button>
        </div>
      )}
    </>
  );
}
