/**
 * Tier-1 pillar pages — the commercial hubs the /guides articles cluster
 * around. Same shape as a guide (see `lib/marketing/guides.ts` for the
 * writing rules) so they share one renderer, but they live at the root path
 * because they are the pages we want cited for the category itself.
 *
 * Every number here is derived from its source of truth — `CREDIT_COSTS`,
 * `PLANS`, `WELCOME_CREDITS` — never retyped. A pillar page an answer engine
 * quotes with a stale price is worse than no page.
 *
 * Claims about which networks publish today must match `lib/social/configured.ts`
 * on production (CLAUDE.md §7d). Re-check that table before editing them.
 */
import type { Guide } from "@/lib/marketing/guides";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PLANS } from "@/lib/billing/plans";
import { WELCOME_CREDITS } from "@/lib/billing/welcome";
import {
  LIVE_PLATFORM_NAMES,
  UPCOMING_PLATFORM_NAMES,
} from "@/lib/marketing/platforms";

export interface Pillar extends Guide {
  /** Root-level path, e.g. "/ai-social-media-content". */
  path: string;
  /** schema.org Service name. */
  serviceName: string;
}

const c = CREDIT_COSTS;
/** One complete campaign: an image set, a caption, a music bed, a 10s video. */
const CAMPAIGN =
  c.image_generation + c.script_generation + c.music_generation + c.video_10s;
const creator = PLANS.find((p) => p.id === "creator")!;
const business = PLANS.find((p) => p.id === "business")!;
const perMonth = (credits: number) => Math.floor(credits / CAMPAIGN);

export const AI_SOCIAL_CONTENT_PILLAR: Pillar = {
  slug: "ai-social-media-content",
  path: "/ai-social-media-content",
  serviceName: "AI social media content creation and publishing",
  title: "AI social media content for New Zealand small businesses",
  description: `Turn one prompt into images, video, music and captions, then publish to ${LIVE_PLATFORM_NAMES}. From NZ$${creator.priceNzd}/month.`,
  updated: "2026-11-15",
  answer: `PrettyMuch is a New Zealand AI tool that turns one written idea into a social media campaign: six images, a short video, a music track and a caption, styled with your brand kit and published straight to ${LIVE_PLATFORM_NAMES}. Plans start at NZ$${creator.priceNzd} a month, and new accounts get ${WELCOME_CREDITS} free credits.`,
  sections: [
    {
      heading: "What does an AI social media content tool actually do?",
      answer:
        "An AI social media content tool generates the posts themselves — images, video, music and captions — from a written description, instead of you designing them or briefing an agency. The useful ones also apply your brand and publish the result, so the work ends with a live post rather than a folder of files.",
      bullets: [
        "Generates images from a text prompt.",
        "Turns a still image into a short video.",
        "Writes captions and scripts in your brand voice.",
        "Applies your logo, colours and fonts.",
        "Publishes or schedules to your social accounts.",
      ],
    },
    {
      heading: "How does PrettyMuch turn one prompt into a campaign?",
      answer:
        "You describe the post you want. PrettyMuch generates six images and you pick the strongest one as the anchor. Everything else — video, music, caption, resized variations — is built from that anchor, so every asset in the campaign shares one look. You then add text, apply your brand kit and publish.",
      table: {
        columns: ["Step", "What you do", "What you get"],
        rows: [
          [
            "1. Prompt",
            "Describe the post in plain English",
            "Six image options",
          ],
          [
            "2. Anchor",
            "Pick the image that fits best",
            "One look for the whole campaign",
          ],
          [
            "3. Branch",
            "Choose video, music, caption or variations",
            "10, 15 or 30 second video, a matched music track, copy",
          ],
          [
            "4. Brand",
            "Add text overlays and your brand kit",
            "Finished, on-brand assets",
          ],
          [
            "5. Publish",
            "Choose networks, post now or schedule",
            "Live posts on your accounts",
          ],
        ],
      },
    },
    {
      heading:
        "How much does AI social content cost compared with a marketing agency?",
      answer: `A full PrettyMuch campaign — image set, caption, music and a 10 second video — uses ${CAMPAIGN} credits. The NZ$${business.priceNzd} Business plan covers about ${perMonth(business.creditsPerMonth)} of those a month. A typical agency campaign carries a setup fee, a monthly retainer and two to three weeks of briefs and approvals before anything goes live.`,
      table: {
        columns: ["", "Typical agency", "PrettyMuch"],
        rows: [
          [
            "Upfront cost",
            "Setup fee, often NZ$1,000+",
            `Free to start (${WELCOME_CREDITS} credits)`,
          ],
          [
            "Monthly cost",
            "Retainer plus ad management",
            `NZ$${creator.priceNzd}–${PLANS[PLANS.length - 1].priceNzd} subscription`,
          ],
          ["Time to first post", "Weeks", "Same session"],
          ["Revisions", "Another round of briefs", "Regenerate in seconds"],
          [
            "Who approves",
            "Agency account manager",
            "You, or your team's approver",
          ],
          ["Paid ad buying", "Included", "Not included"],
        ],
      },
      body: [
        "In one engagement we saw firsthand, a mid-tier agency's campaign ran to 13 tasks across six departments over 18 calendar days — five of them briefs and four of them reviews — and the ads still had not gone live. That overhead is what PrettyMuch replaces.",
      ],
    },
    {
      heading: "Which social networks can PrettyMuch publish to?",
      answer: `PrettyMuch publishes directly to ${LIVE_PLATFORM_NAMES}, using a connection your business owns rather than a paid intermediary. Publishing to those networks costs no credits. ${UPCOMING_PLATFORM_NAMES} are built and switch on as each platform completes its developer approval.`,
      bullets: [
        "Facebook and Instagram: connect once through Meta, then pick your Page.",
        "TikTok: video posts, with TikTok's own privacy and disclosure choices.",
        "Bluesky: paste your handle and an app password — no setup.",
        "Publishing is free; only generation uses credits.",
      ],
    },
    {
      heading: "Will AI-generated posts look like my brand?",
      answer:
        "Yes, if the tool applies your brand rather than guessing it. PrettyMuch stores your logo, colours and fonts in a brand kit and stamps them onto every asset, and you choose the anchor image yourself — so a person, not the model, decides what represents the business.",
      bullets: [
        "Brand kit: logo, colour palette and fonts saved once.",
        "Text overlays placed on the image, not baked into the prompt.",
        "Approval workflow: team members submit, an owner or admin approves.",
        "Every asset in a campaign comes from the same anchor image.",
      ],
    },
    {
      heading: "Who is PrettyMuch built for?",
      answer:
        "PrettyMuch is built for New Zealand small businesses that need regular, professional social content but have no in-house designer and no budget for an agency retainer. It also suits small agencies managing several clients' brands. It is not a paid-ads manager — it makes and publishes the content, not the ad spend.",
      table: {
        columns: ["Good fit", "Not the right tool"],
        rows: [
          [
            "Café, retailer or trade posting weekly",
            "Businesses that only need paid ad buying",
          ],
          [
            "Owner who does their own marketing",
            "Brands that require bespoke photo shoots",
          ],
          [
            "Small agency running several client brands",
            "Teams needing X, Threads or Snapchat today",
          ],
        ],
      },
    },
  ],
  faq: [
    {
      q: "Is PrettyMuch free to try?",
      a: `Yes. New accounts get ${WELCOME_CREDITS} free credits with no card required — enough for an image set and a 10 second video.`,
    },
    {
      q: "Can I use the images and videos commercially?",
      a: "Yes. PrettyMuch grants commercial rights to everything you generate — images, video, music and captions.",
    },
    {
      q: "How long can the videos be?",
      a: "10, 15 or 30 seconds. 30 second videos are available on paid plans.",
    },
    {
      q: "Is PrettyMuch a New Zealand company?",
      a: "Yes. PrettyMuch is built and run in Paihia, Northland, and prices every plan in New Zealand dollars.",
    },
  ],
};

export const PILLARS: Pillar[] = [AI_SOCIAL_CONTENT_PILLAR];
