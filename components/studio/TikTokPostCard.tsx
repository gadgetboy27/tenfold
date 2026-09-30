"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  TIKTOK_PRIVACY,
  TIKTOK_PRIVACY_LABEL,
  type TikTokDraft,
  type TikTokPrivacyLevel,
} from "@/lib/social/tiktok-options";

interface Creator {
  nickname: string | null;
  privacyOptions: TikTokPrivacyLevel[];
  maxDurationSec: number | null;
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

const MUSIC_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRAND_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/**
 * TikTok's own posting screen. TikTok only approves Direct Post for apps whose
 * screen follows its content-sharing rules, so this is not decoration: who is
 * posting, a privacy choice built from THIS account's allowed list (and not
 * pre-selected), comment / duet / stitch each off until the user turns them on
 * (and unavailable where the account has them off), a commercial-content
 * disclosure, a preview of what will go out, and TikTok's consent line.
 */
export function TikTokPostCard({
  workspaceSlug,
  videoUrl,
  draft,
  onChange,
}: {
  workspaceSlug: string;
  videoUrl: string | null;
  draft: TikTokDraft;
  onChange: (next: TikTokDraft) => void;
}) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await api("/api/social/tiktok/creator", { workspaceSlug });
        const data = (await res.json().catch(() => ({}))) as
          | Creator
          | { error?: string };
        if (!live) return;
        if (!res.ok) {
          setError(
            (data as { error?: string }).error ?? "Couldn't reach TikTok",
          );
          return;
        }
        setCreator(data as Creator);
      } catch {
        if (live) setError("Couldn't reach TikTok");
      }
    })();
    return () => {
      live = false;
    };
  }, [workspaceSlug]);

  const brand = draft.commercial.enabled && draft.commercial.brandedContent;
  const isPrivate = draft.privacy === "SELF_ONLY";
  const set = (patch: Partial<TikTokDraft>) => onChange({ ...draft, ...patch });
  const setBrand = (patch: Partial<TikTokDraft["commercial"]>) => {
    const commercial = { ...draft.commercial, ...patch };
    // Branded content can't be private — drop a now-invalid choice rather than
    // leave the user holding one the post would be refused for.
    const privacy =
      commercial.enabled &&
      commercial.brandedContent &&
      draft.privacy === "SELF_ONLY"
        ? null
        : draft.privacy;
    onChange({ ...draft, commercial, privacy });
  };

  const interaction = (
    label: string,
    key: "allowComment" | "allowDuet" | "allowStitch",
    creatorOff: boolean,
    privateBlocks: boolean,
  ) => {
    const blocked = creatorOff || privateBlocks;
    return (
      <label
        key={key}
        className={`flex items-center gap-1.5 text-xs ${blocked ? "opacity-50" : ""}`}
        title={
          creatorOff
            ? "Turned off in your TikTok settings"
            : privateBlocks
              ? "Not available on a private video"
              : undefined
        }
      >
        <input
          type="checkbox"
          disabled={blocked}
          checked={!blocked && draft[key]}
          onChange={(e) => set({ [key]: e.target.checked })}
        />
        {label}
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-medium">TikTok post settings</p>

      {!creator && !error && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking your TikTok
          account…
        </p>
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {creator && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Posting as{" "}
            <strong>{creator.nickname ?? "your TikTok account"}</strong>
            {creator.maxDurationSec
              ? ` · videos up to ${Math.round(creator.maxDurationSec / 60)} min`
              : ""}
          </p>

          {videoUrl && (
            <video
              src={videoUrl}
              controls
              muted
              playsInline
              className="max-h-56 w-fit rounded-lg border border-border bg-black"
            />
          )}

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Who can view this video
            </label>
            <select
              value={draft.privacy ?? ""}
              onChange={(e) =>
                set({
                  privacy: (e.target.value ||
                    null) as TikTokPrivacyLevel | null,
                })
              }
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Select who can view…</option>
              {TIKTOK_PRIVACY.filter((p) =>
                creator.privacyOptions.includes(p),
              ).map((p) => (
                <option key={p} value={p} disabled={brand && p === "SELF_ONLY"}>
                  {TIKTOK_PRIVACY_LABEL[p]}
                  {brand && p === "SELF_ONLY"
                    ? " (not for branded content)"
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">
              Allow users to
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {interaction(
                "Comment",
                "allowComment",
                creator.commentDisabled,
                false,
              )}
              {interaction(
                "Duet",
                "allowDuet",
                creator.duetDisabled,
                isPrivate,
              )}
              {interaction(
                "Stitch",
                "allowStitch",
                creator.stitchDisabled,
                isPrivate,
              )}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={draft.commercial.enabled}
                onChange={(e) => setBrand({ enabled: e.target.checked })}
              />
              This video promotes a brand, product or service
            </label>
            {draft.commercial.enabled && (
              <div className="mt-1.5 ml-5 flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.commercial.yourBrand}
                    onChange={(e) => setBrand({ yourBrand: e.target.checked })}
                  />
                  Your brand — you&apos;re promoting yourself or your own
                  business
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.commercial.brandedContent}
                    onChange={(e) =>
                      setBrand({ brandedContent: e.target.checked })
                    }
                  />
                  Branded content — a paid partnership with another brand
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {draft.commercial.brandedContent
                    ? "Your video will be labelled “Paid partnership”."
                    : draft.commercial.yourBrand
                      ? "Your video will be labelled “Promotional content”."
                      : "Choose at least one option."}
                </p>
              </div>
            )}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            By posting, you agree to TikTok&apos;s{" "}
            {brand && (
              <>
                <a
                  href={BRAND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Branded Content Policy
                </a>{" "}
                and{" "}
              </>
            )}
            <a
              href={MUSIC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Music Usage Confirmation
            </a>
            .
          </p>
          <p className="text-[11px] text-muted-foreground">
            After you publish, it can take a few minutes for TikTok to process
            the video before it shows on your profile.
          </p>
        </>
      )}
    </div>
  );
}
