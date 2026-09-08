"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2,
  Globe,
  ExternalLink,
  Copy,
  Trash2,
  Check,
  Users,
  CircleDashed,
  Download,
} from "lucide-react";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { useCreditEstimate } from "@/lib/billing/useCreditEstimate";
import {
  LANDING_STYLE_INFO,
  type LandingBlock,
  type LandingStyle,
} from "@/lib/landing/blocks";

/**
 * "Build a landing page" — the last thing on the Publish rail.
 *
 * Placed at the END and gated on everything else being settled, because the
 * page is downstream of the ad in the most literal way: it has to say what the
 * ads say, in the brand the ads use, showing the image the ads show. Offering
 * it before the caption is written would produce a page arguing a different
 * case to the one the click was made on.
 *
 * The gate is a CHECKLIST, not a disabled button. "Not ready" with no reason is
 * the most annoying possible state, so every unmet condition is named and the
 * user can go fix it.
 */

interface LandingPageRow {
  id: string;
  slug: string;
  style: LandingStyle;
  title: string;
  description: string;
  blocks: LandingBlock[];
  published_at: string | null;
  leadCount: number;
}

export function LandingPagePanel({
  workspaceSlug,
  campaignId,
  caption,
  blockers,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  caption: string;
  /** What still has to be true before this can run. Empty means ready. */
  blockers: string[];
}) {
  const [pages, setPages] = useState<LandingPageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const cost = CREDIT_COSTS.landing_pages;
  const { label: costLabel } = useCreditEstimate(cost, workspaceSlug);
  const ready = blockers.length === 0 && !!campaignId;

  // Same shape as every other mount-fetch in this rail: an async IIFE with an
  // `alive` flag, so a fast unmount can't set state on a gone component.
  useEffect(() => {
    if (!campaignId) return;
    let alive = true;
    (async () => {
      try {
        const res = await api(`/api/campaigns/${campaignId}/landing`, {
          workspaceSlug,
        });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { pages?: LandingPageRow[] };
        if (alive) setPages(data.pages ?? []);
      } catch {
        // A failed list is not worth a toast — the button still works.
      }
    })();
    return () => {
      alive = false;
    };
  }, [campaignId, workspaceSlug]);

  const generate = async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const res = await api(`/api/campaigns/${campaignId}/landing`, {
        method: "POST",
        workspaceSlug,
        body: JSON.stringify({ caption }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        pages?: LandingPageRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not write the pages");
      setPages((prev) => [...prev, ...(data.pages ?? [])]);
      toast.success(
        `${data.pages?.length ?? 0} pages written — pick one and publish it`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const setPublished = async (page: LandingPageRow, published: boolean) => {
    setBusyId(page.id);
    try {
      const res = await api(`/api/landing/${page.id}`, {
        method: "PATCH",
        workspaceSlug,
        body: JSON.stringify({ published }),
      });
      if (!res.ok) throw new Error("That didn't work");
      const data = (await res.json()) as { page: LandingPageRow };
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, published_at: data.page.published_at } : p,
        ),
      );
      toast.success(published ? "Page is live" : "Page taken down");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (page: LandingPageRow) => {
    // Leads cascade with the page. Say so, with the number, rather than
    // discovering it afterwards.
    const warning = page.leadCount
      ? `Delete this page and its ${page.leadCount} lead${page.leadCount === 1 ? "" : "s"}? That can't be undone.`
      : "Delete this page?";
    if (!window.confirm(warning)) return;
    setBusyId(page.id);
    try {
      const res = await api(`/api/landing/${page.id}`, {
        method: "DELETE",
        workspaceSlug,
      });
      if (!res.ok) throw new Error("Could not delete that page");
      setPages((prev) => prev.filter((p) => p.id !== page.id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (page: LandingPageRow) => {
    const url = `${window.location.origin}/p/${page.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(page.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error(url);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] leading-snug text-muted-foreground">
        A page for the ad to point at — your image, your brand, saying what the
        caption says, with a form on it. Three versions, so you can pick the one
        that suits the job.
      </p>

      {/* ── The gate, stated as work remaining ── */}
      {!ready && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-amber-500">
            Finish the ad first — the page is built from it
          </p>
          <ul className="space-y-1">
            {blockers.map((b) => (
              <li
                key={b}
                className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
              >
                <CircleDashed className="mt-px h-3 w-3 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── What it costs, before you press it ── */}
      <div className="rounded-lg border border-border bg-background p-2.5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">Three pages, written for you</p>
            <p className="text-[11px] text-muted-foreground">
              An enquiry page, a story page and an offer page. Publishing,
              editing and collecting leads are all free — you only pay for the
              writing.
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {costLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={!ready || loading}
          title={ready ? undefined : blockers.join(" · ")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          {loading
            ? "Writing three pages…"
            : pages.length
              ? `Write three more · ${cost} credits`
              : `Write my landing pages · ${cost} credits`}
        </button>
      </div>

      {/* ── What came back ── */}
      {pages.map((page) => {
        const info = LANDING_STYLE_INFO[page.style];
        const live = !!page.published_at;
        const busy = busyId === page.id;
        return (
          <div
            key={page.id}
            className={`rounded-lg border p-2.5 transition-colors ${
              live ? "border-primary/40 bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  {info?.label ?? page.style}
                  {live && (
                    <span className="rounded bg-primary/20 px-1 py-px text-[9px] uppercase tracking-wide text-primary">
                      Live
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {page.title}
                </p>
              </div>
              {/* The count IS the download. A lead nobody can read is worse
                  than no form, so the number is never just a number. */}
              {page.leadCount > 0 && (
                <a
                  href={`/api/landing/${page.id}/leads`}
                  title={`Download ${page.leadCount} lead${page.leadCount === 1 ? "" : "s"} as CSV`}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                >
                  <Users className="h-3 w-3" />
                  {page.leadCount}
                  <Download className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {info?.blurb}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPublished(page, !live)}
                disabled={busy}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                  live
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-primary/40 bg-primary/10 text-primary"
                }`}
              >
                {busy ? "…" : live ? "Take down" : "Publish page"}
              </button>

              {/* Only a live page gets a link. A draft URL 404s, and handing
                  someone a link that doesn't work is worse than no link. */}
              {live && (
                <>
                  <a
                    href={`/p/${page.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" /> View
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(page)}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied === page.id ? (
                      <>
                        <Check className="h-3 w-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy link
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => remove(page)}
                disabled={busy}
                title="Delete this page"
                className="ml-auto rounded-md border border-border p-1 text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
