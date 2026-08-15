"use client";

import { AlertTriangle, Clock, Loader2 } from "lucide-react";

/**
 * What to say when a logo phase stops making progress.
 *
 * The concepts poll used to run forever against a job that might never finish,
 * leaving "Generating… 0 of 6 ready" on screen with no reason and no way out.
 * The three states below are genuinely different — including in whether the
 * user's credits came back — so they are NOT collapsed into one "something
 * went wrong":
 *
 *  - `failed`   the job is marked failed server-side. The fal webhook refunds
 *               on this path (`finalizeMultiImage` → `refundCredits`), so we
 *               can promise the credits are back.
 *  - `slow`     still processing, past the point where it usually lands.
 *               Nothing is wrong yet; images often still arrive.
 *  - `stuck`    still processing well past any plausible render time. Almost
 *               always a webhook that never came back. Critically, this path
 *               does NOT refund — the job sits in `processing` forever and no
 *               code marks it failed — so we must not imply the credits
 *               returned. Say they were spent and point at support.
 */

export type LogoStallKind = "failed" | "slow" | "stuck";

export interface LogoStall {
  kind: LogoStallKind;
  /** Server-supplied failure text, when there is one. */
  detail?: string | null;
  /** How many assets did land, for the "carry on with these" offer. */
  arrived: number;
  expected: number;
}

const COPY: Record<
  LogoStallKind,
  { icon: typeof Clock; tone: string; title: string; body: string }
> = {
  failed: {
    icon: AlertTriangle,
    tone: "border-destructive/40 bg-destructive/5",
    title: "That didn't work",
    body: "The generation failed, so your credits have been put back. You can start over — it usually works on a second run.",
  },
  slow: {
    icon: Loader2,
    tone: "border-amber-400/40 bg-amber-400/5",
    title: "Taking longer than usual",
    body: "Still waiting on the renderer. This normally takes under a minute, but a busy queue can stretch it out. Nothing is lost if you keep waiting.",
  },
  stuck: {
    icon: AlertTriangle,
    tone: "border-destructive/40 bg-destructive/5",
    title: "Nothing has come back",
    body: "The renderer never reported in, so we've stopped waiting. These credits were spent and won't come back automatically — get in touch and we'll sort it out.",
  },
};

export function LogoStallNotice({
  stall,
  onKeepWaiting,
  onContinue,
  onStartOver,
}: {
  stall: LogoStall;
  /** Only offered while there's still reason to think it'll land. */
  onKeepWaiting?: () => void;
  /** Only offered when something partial actually arrived. */
  onContinue?: () => void;
  onStartOver: () => void;
}) {
  const { icon: Icon, tone, title, body } = COPY[stall.kind];
  const partial = stall.arrived > 0 && stall.arrived < stall.expected;

  return (
    <div
      role="status"
      className={`mx-auto mb-6 max-w-3xl rounded-xl border p-4 ${tone}`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon
          className={`h-4 w-4 ${stall.kind === "slow" ? "animate-spin" : ""}`}
        />
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {stall.detail && (
        <p className="mt-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
          {stall.detail}
        </p>
      )}
      {partial && (
        <p className="mt-2 text-xs text-muted-foreground">
          {stall.arrived} of {stall.expected} concepts did arrive — you can use
          one of those instead of starting again.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onKeepWaiting && (
          <button
            type="button"
            onClick={onKeepWaiting}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Keep waiting
          </button>
        )}
        {partial && onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Use what arrived
          </button>
        )}
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
