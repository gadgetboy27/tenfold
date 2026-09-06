"use client";

import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

/**
 * A confirmation the user can actually read.
 *
 * The existing destructive actions use `window.confirm`, which the browser
 * renders as a modal chrome dialog: it steals focus, it cannot show what is
 * about to be destroyed, it looks nothing like the product, and on some
 * platforms it carries a "prevent this page from creating more dialogs"
 * checkbox that permanently disables every later confirm on the origin. That
 * last one matters here — a user who ticks it once can never be asked again,
 * and the next delete goes through silently.
 *
 * This is a toast card instead: same promise-shaped API, so a call site reads
 * exactly like the `window.confirm` it replaces, but it can carry a body line
 * naming the consequence and it renders in the product's own skin.
 *
 * Resolves false on dismiss (timeout or swipe), never null — "they didn't
 * answer" and "they said no" are the same instruction for a destructive act.
 */
export function confirmToast(opts: {
  /** The question. Keep it short — it's the bold line. */
  title: string;
  /** What will actually happen. This is where the irreversible part goes. */
  body?: string;
  /** Defaults to "Delete" — name the verb, never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** How long before an unanswered card gives up and resolves false. */
  durationMs?: number;
}): Promise<boolean> {
  const {
    title,
    body,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    durationMs = 15000,
  } = opts;

  return new Promise<boolean>((resolve) => {
    // Guard so a double-click, or a dismiss racing a click, can only settle the
    // promise once — resolving twice would be silent, and the second resolve
    // would be the one that looks like an unexplained no-op.
    let settled = false;
    const settle = (answer: boolean, id: string) => {
      if (settled) return;
      settled = true;
      toast.dismiss(id);
      resolve(answer);
    };

    toast.custom(
      (t) => (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={title}
          className={`pointer-events-auto w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[#111111] text-[#F0F0F0] shadow-xl transition-all ${
            t.visible ? "animate-in fade-in slide-in-from-top-2" : "opacity-0"
          }`}
        >
          <div className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              {body && (
                <p className="mt-1 text-xs leading-relaxed text-white/60">
                  {body}
                </p>
              )}
            </div>
          </div>
          <div className="flex border-t border-white/10">
            <button
              type="button"
              onClick={() => settle(false, t.id)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => settle(true, t.id)}
              className="flex-1 border-l border-white/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: durationMs },
    );

    // react-hot-toast's own timeout removes the card without telling us, so
    // mirror it here: without this the promise never settles and the caller's
    // `await` hangs forever, leaving a button spinning with nothing behind it.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, durationMs + 500);
  });
}
