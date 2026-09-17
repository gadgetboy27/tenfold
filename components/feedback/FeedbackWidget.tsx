"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquarePlus,
  X,
  Loader2,
  Bug,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

type Category = "bug" | "idea" | "question";

const CATEGORIES: {
  id: Category;
  label: string;
  icon: typeof Bug;
  hint: string;
}[] = [
  {
    id: "bug",
    label: "Something's wrong",
    icon: Bug,
    hint: "What did you do, and what happened instead?",
  },
  {
    id: "idea",
    label: "An idea",
    icon: Lightbulb,
    hint: "What would make this better for you?",
  },
  {
    id: "question",
    label: "A question",
    icon: HelpCircle,
    hint: "What are you trying to do?",
  },
];

/**
 * Feedback, from inside the product, with the context attached.
 *
 * The previous widget lived only in `TopBar`, which Studio never inherited —
 * so the main site had no way to report anything. This one sits in Studio's
 * header and, more usefully, captures what a report usually has to be asked
 * for: the page, the Studio section, the open campaign, the browser and the
 * viewport. The sender's address is resolved server-side from the session.
 * Reports land in the feedback queue (GET /api/ops/feedback) and notify by
 * email.
 */
export function FeedbackWidget({
  workspaceSlug,
  section,
  campaignId,
}: {
  workspaceSlug?: string;
  section?: string;
  campaignId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const send = async () => {
    if (message.trim().length < 3) {
      toast.error("Tell me a little more.");
      return;
    }
    setSending(true);
    try {
      const res = await api("/api/feedback", {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({
          message: message.trim(),
          category,
          context: {
            page: window.location.pathname + window.location.search,
            section,
            campaignId: campaignId ?? undefined,
            userAgent: navigator.userAgent.slice(0, 400),
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Couldn't send that");
      }
      toast.success("Sent — thank you. I read every one.");
      setMessage("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  };

  const active = CATEGORIES.find((c) => c.id === category)!;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Report a problem or send an idea"
        aria-label="Send feedback"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Send feedback"
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              What&apos;s up?
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const on = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] leading-tight transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {c.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={active.hint}
            autoFocus
            rows={4}
            className="mb-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <p className="mb-3 text-[11px] text-muted-foreground">
            Sent with the page you&apos;re on
            {section ? `, the ${section} tool` : ""}
            {campaignId ? ", this project" : ""} and your browser, so it can be
            reproduced.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send
          </button>
        </div>
      )}
    </div>
  );
}
