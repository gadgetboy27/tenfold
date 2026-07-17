import toast from "react-hot-toast";
import { api } from "@/lib/api";

/**
 * Save an asset to disk via the download gate, which hands back the
 * watermarked derivative on free tiers and the untouched source on paid ones.
 *
 * Every download button routes through here: three call sites had each grown
 * their own `fetch(url) → blob → a.click()` copy, and a fourth would have been
 * a fourth place to forget the gate.
 *
 * The file is never withheld — it is stamped, and the user is told why. Saying
 * nothing is what makes a mark feel like a trick rather than a plan.
 */
export async function downloadAsset(opts: {
  assetId: string;
  /** Fallback URL if the gate is unreachable — better a clean file than none. */
  url: string;
  filename: string;
  workspaceSlug: string;
}): Promise<void> {
  let href = opts.url;
  let stamped = false;
  try {
    const res = await api(`/api/assets/${opts.assetId}/download`, {
      workspaceSlug: opts.workspaceSlug,
    });
    if (res.ok) {
      const data = (await res.json()) as {
        url?: string;
        watermarked?: boolean;
      };
      if (data.url) href = data.url;
      stamped = data.watermarked === true;
    }
  } catch {
    // Gate unreachable — fall through to the source URL. A failed download is a
    // worse outcome than an unstamped one; the mark is a nudge, not DRM.
  }

  // Report what actually happened: the route reports `watermarked` by comparing
  // URLs, so a stamp that silently failed never claims to have been applied.
  if (stamped) {
    toast(
      "Saved with the “built with tenfold” mark. Upgrade to any paid plan to download clean — no need to regenerate.",
      { icon: "✳", duration: 6000 },
    );
  }

  try {
    const blob = await (await fetch(href)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = objectUrl;
    el.download = opts.filename;
    el.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(href, "_blank", "noopener");
  }
}
