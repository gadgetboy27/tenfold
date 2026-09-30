import { z } from "zod";

/**
 * What the user chose on the TikTok posting screen. Shared by the client (to
 * validate before sending) and the server (to parse what arrives) so the two
 * can't disagree about what a complete choice is.
 *
 * TikTok's content-sharing rules shape every field:
 *  - `privacy` has NO default. The user must pick, from the list TikTok
 *    returned for THIS account — pre-selecting one is a guideline violation.
 *  - Comment / Duet / Stitch start unticked: nothing is enabled on the user's
 *    behalf.
 *  - Commercial disclosure is opt-in, and when on, at least one of "your own
 *    brand" / "branded content (paid partnership)" must be chosen.
 */
export const TIKTOK_PRIVACY = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY)[number];

export const TIKTOK_PRIVACY_LABEL: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

export const tiktokPostSchema = z.object({
  privacy: z.enum(TIKTOK_PRIVACY),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  commercial: z
    .object({
      enabled: z.boolean(),
      yourBrand: z.boolean(),
      brandedContent: z.boolean(),
    })
    .optional(),
});
export type TikTokPostOptions = z.infer<typeof tiktokPostSchema>;

/** The form's state: the same, except privacy may not be chosen yet. */
export interface TikTokDraft {
  privacy: TikTokPrivacyLevel | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercial: {
    enabled: boolean;
    yourBrand: boolean;
    brandedContent: boolean;
  };
}

export const EMPTY_TIKTOK_DRAFT: TikTokDraft = {
  privacy: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: { enabled: false, yourBrand: false, brandedContent: false },
};

/** A sentence saying what's missing, or null when the draft can be posted. */
export function tiktokDraftProblem(d: TikTokDraft): string | null {
  if (!d.privacy) return "TikTok: choose who can view this video.";
  if (
    d.commercial.enabled &&
    !d.commercial.yourBrand &&
    !d.commercial.brandedContent
  )
    return "TikTok: you turned on commercial disclosure — say whether it promotes your own brand, a paid partnership, or both.";
  if (
    d.commercial.enabled &&
    d.commercial.brandedContent &&
    d.privacy === "SELF_ONLY"
  )
    return "TikTok: branded content can't be private — pick who can view it.";
  return null;
}

/** The draft as the options the server takes; null while it's incomplete. */
export function tiktokOptionsFromDraft(
  d: TikTokDraft,
): TikTokPostOptions | null {
  if (tiktokDraftProblem(d) || !d.privacy) return null;
  return {
    privacy: d.privacy,
    allowComment: d.allowComment,
    allowDuet: d.allowDuet,
    allowStitch: d.allowStitch,
    commercial: d.commercial.enabled ? d.commercial : undefined,
  };
}
