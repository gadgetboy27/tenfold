// Profile + cover dimensions for the social platforms Tenfold publishes to
// (Ayrshare set). Deduplicated where platforms share sizes. Profiles are square
// (logo centred on a padded canvas); covers are wide banners.

export interface SocialSize {
  /** File-safe slug used in the bundle path. */
  key: string;
  label: string;
  width: number;
  height: number;
  kind: "profile" | "cover";
}

export const SOCIAL_SIZES: SocialSize[] = [
  // Profile avatars (square) — one per common resolution, labelled by platform.
  {
    key: "instagram-profile",
    label: "Instagram profile",
    width: 320,
    height: 320,
    kind: "profile",
  },
  {
    key: "facebook-profile",
    label: "Facebook profile",
    width: 512,
    height: 512,
    kind: "profile",
  },
  {
    key: "x-profile",
    label: "X (Twitter) profile",
    width: 400,
    height: 400,
    kind: "profile",
  },
  {
    key: "linkedin-profile",
    label: "LinkedIn profile",
    width: 400,
    height: 400,
    kind: "profile",
  },
  {
    key: "youtube-profile",
    label: "YouTube profile",
    width: 800,
    height: 800,
    kind: "profile",
  },
  {
    key: "tiktok-profile",
    label: "TikTok profile",
    width: 200,
    height: 200,
    kind: "profile",
  },
  // Cover / banner images (wide).
  {
    key: "facebook-cover",
    label: "Facebook cover",
    width: 820,
    height: 312,
    kind: "cover",
  },
  {
    key: "x-header",
    label: "X (Twitter) header",
    width: 1500,
    height: 500,
    kind: "cover",
  },
  {
    key: "linkedin-cover",
    label: "LinkedIn cover",
    width: 1584,
    height: 396,
    kind: "cover",
  },
  {
    key: "youtube-banner",
    label: "YouTube banner",
    width: 2048,
    height: 1152,
    kind: "cover",
  },
];
