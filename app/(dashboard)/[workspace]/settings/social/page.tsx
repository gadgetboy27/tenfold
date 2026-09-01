"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Circle,
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckSquare,
  Square,
  Wand2,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BlueskyConnectDialog } from "@/components/settings/BlueskyConnectDialog";
import { DestinationPicker } from "@/components/settings/DestinationPicker";
import { isUnhealthy, type ConnectionHealth } from "@/lib/social/health";

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  connected_at: string | null;
  /** How it was linked: Meta OAuth ("native"), our own direct backend
   *  ("direct" — Bluesky/Reddit/Pinterest), or Ayrshare's hosted flow. */
  source?: "native" | "direct" | "ayrshare";
  /** Facebook only: which Page is active + all managed Pages for the picker. */
  activePageId?: string | null;
  availablePages?: { id: string; name: string }[];
  /** Reddit/Pinterest: where posts actually land (null until chosen). */
  destination?: { label: string; value: string | null } | null;
  availableBoards?: { id: string; name: string }[];
}

interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  link?: { text: string; url: string };
}

interface PlatformGuide {
  id: string;
  label: string;
  color: string;
  bg: string;
  description: string;
  accountType: string;
  steps: Array<{ instruction: string; link?: { text: string; url: string } }>;
  checklist: ChecklistItem[];
}

/**
 * The networks that ONLY reach their API through Ayrshare. Facebook, Instagram,
 * Bluesky, Reddit, LinkedIn and Pinterest each connect directly (CLAUDE.md
 * §7d), so they are unaffected when Ayrshare is off or its account is
 * suspended.
 */
const AYRSHARE_ONLY = new Set([
  "x",
  "twitter",
  "threads",
  "snapchat",
  "gmb",
  "telegram",
]);

const PLATFORMS: PlatformGuide[] = [
  {
    id: "instagram",
    label: "Instagram",
    color: "#E1306C",
    bg: "bg-[#E1306C]/10",
    description: "Photos, Reels & Stories",
    accountType: "Requires a Business or Creator account (not Personal)",
    steps: [
      {
        instruction:
          "Go to your Instagram profile → Settings → Account → Switch to Professional Account",
        link: {
          text: "Instagram settings",
          url: "https://www.instagram.com/accounts/convert_to_business/",
        },
      },
      {
        instruction:
          "Choose Creator or Business and follow the on-screen steps",
      },
      {
        instruction:
          "Link your Instagram to a Facebook Page (required for Business accounts)",
        link: {
          text: "Add a Facebook Page",
          url: "https://www.facebook.com/pages/creation/",
        },
      },
      {
        instruction: "Enable two-factor authentication for account security",
        link: {
          text: "Security settings",
          url: "https://www.instagram.com/accounts/two_factor_authentication/app/",
        },
      },
    ],
    checklist: [
      {
        key: "account_type",
        label: "Account switched to Business or Creator",
        required: true,
      },
      {
        key: "facebook_page",
        label: "Linked to a Facebook Page",
        required: true,
      },
      {
        key: "2fa",
        label: "Two-factor authentication enabled",
        required: false,
      },
      {
        key: "username_ready",
        label: "Username and password ready to log in",
        required: true,
      },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    color: "#0A66C2",
    bg: "bg-[#0A66C2]/10",
    description: "Professional network",
    accountType: "Personal account or Company Page admin",
    steps: [
      {
        instruction:
          "Confirm your LinkedIn personal account is active and in good standing",
        link: {
          text: "LinkedIn account",
          url: "https://www.linkedin.com/feed/",
        },
      },
      {
        instruction:
          "If posting to a Company Page, confirm you have Admin access",
        link: {
          text: "Manage your page",
          url: "https://www.linkedin.com/company/setup/new/",
        },
      },
      {
        instruction: "Enable two-step verification",
        link: {
          text: "Security settings",
          url: "https://www.linkedin.com/psettings/two-step-verification",
        },
      },
    ],
    checklist: [
      {
        key: "account_active",
        label: "LinkedIn account is active",
        required: true,
      },
      {
        key: "page_admin",
        label: "Company Page admin access confirmed (if applicable)",
        required: false,
      },
      {
        key: "credentials_ready",
        label: "Login credentials ready",
        required: true,
      },
    ],
  },
  {
    id: "twitter",
    label: "Twitter / X",
    color: "#ffffff",
    bg: "bg-white/10",
    description: "Posts & threads",
    accountType: "Standard account — phone verification required",
    steps: [
      {
        instruction: "Verify your phone number is linked to your X account",
        link: { text: "X settings", url: "https://x.com/settings/phone" },
      },
      {
        instruction: "Enable two-factor authentication",
        link: {
          text: "2FA settings",
          url: "https://x.com/settings/account/login_verification",
        },
      },
      {
        instruction:
          "Ensure your account is not suspended or in a restricted state",
        link: { text: "Account status", url: "https://x.com/settings/account" },
      },
    ],
    checklist: [
      {
        key: "phone_verified",
        label: "Phone number verified on X account",
        required: true,
      },
      {
        key: "account_standing",
        label: "Account is active and not restricted",
        required: true,
      },
      {
        key: "2fa",
        label: "Two-factor authentication enabled",
        required: false,
      },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    color: "#1877F2",
    bg: "bg-[#1877F2]/10",
    description: "Pages & groups",
    accountType:
      "Requires a Facebook Page — personal profiles cannot be published to via API",
    steps: [
      {
        instruction:
          "Create a Facebook Page for your business (if you don't have one)",
        link: {
          text: "Create a Page",
          url: "https://www.facebook.com/pages/creation/",
        },
      },
      {
        instruction: "Confirm you are an Admin of the Page",
        link: {
          text: "Page settings",
          url: "https://www.facebook.com/settings?tab=pages",
        },
      },
      {
        instruction:
          "Ensure your personal Facebook account that owns the Page is in good standing",
      },
    ],
    checklist: [
      {
        key: "page_exists",
        label: "Facebook Page created for your business",
        required: true,
      },
      {
        key: "page_admin",
        label: "You are an Admin of the Page",
        required: true,
      },
      {
        key: "account_standing",
        label: "Facebook account in good standing",
        required: true,
      },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    color: "#FF0000",
    bg: "bg-[#FF0000]/10",
    description: "Videos & Shorts",
    accountType: "Google account with a YouTube channel",
    steps: [
      {
        instruction:
          "Sign in to YouTube and create or confirm your channel exists",
        link: { text: "YouTube Studio", url: "https://studio.youtube.com" },
      },
      {
        instruction:
          "Complete your channel profile (name, description, profile photo)",
        link: {
          text: "Channel customisation",
          url: "https://studio.youtube.com/channel/UC/editing/basics",
        },
      },
      {
        instruction:
          "Verify your channel via phone to unlock longer video uploads",
        link: { text: "Verify channel", url: "https://www.youtube.com/verify" },
      },
    ],
    checklist: [
      {
        key: "channel_exists",
        label: "YouTube channel created",
        required: true,
      },
      {
        key: "channel_verified",
        label: "Channel verified via phone",
        required: true,
      },
      {
        key: "profile_complete",
        label: "Channel profile filled in",
        required: false,
      },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    color: "#69C9D0",
    bg: "bg-[#69C9D0]/10",
    description: "Short-form video",
    accountType:
      "TikTok Business or Creator account, account must be 30+ days old",
    steps: [
      {
        instruction: "Switch to a Business or Creator account",
        link: {
          text: "Switch account type",
          url: "https://www.tiktok.com/business/en-US/blog/how-to-switch-to-business-account",
        },
      },
      {
        instruction: "Verify your phone number on the account",
        link: {
          text: "TikTok settings",
          url: "https://www.tiktok.com/setting",
        },
      },
      {
        instruction:
          "Ensure the account is at least 30 days old (TikTok API requirement)",
      },
      { instruction: "Complete your profile with a bio and profile photo" },
    ],
    checklist: [
      {
        key: "account_type",
        label: "Account set to Business or Creator",
        required: true,
      },
      { key: "phone_verified", label: "Phone number verified", required: true },
      {
        key: "account_age",
        label: "Account is at least 30 days old",
        required: true,
      },
    ],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    color: "#E60023",
    bg: "bg-[#E60023]/10",
    description: "Pins & boards",
    accountType: "Pinterest Business account",
    steps: [
      {
        instruction: "Convert to or create a Pinterest Business account",
        link: {
          text: "Create Business account",
          url: "https://business.pinterest.com",
        },
      },
      {
        instruction: "Create at least one board to publish pins to",
        link: { text: "Pinterest home", url: "https://www.pinterest.com" },
      },
      {
        instruction: "Optionally claim your website to get attribution on pins",
        link: {
          text: "Claim website",
          url: "https://www.pinterest.com/settings/claim",
        },
      },
    ],
    checklist: [
      {
        key: "business_account",
        label: "Pinterest Business account activated",
        required: true,
      },
      {
        key: "board_created",
        label: "At least one board created",
        required: true,
      },
      {
        key: "website_claimed",
        label: "Website claimed (recommended)",
        required: false,
      },
    ],
  },
  {
    id: "bluesky",
    label: "Bluesky",
    color: "#0085FF",
    bg: "bg-[#0085FF]/10",
    description: "Posts & images",
    accountType: "Any Bluesky account — no business account needed",
    steps: [
      {
        instruction:
          "In the Bluesky app, go to Settings → Privacy and security → App passwords",
        link: {
          text: "Open Bluesky settings",
          url: "https://bsky.app/settings/app-passwords",
        },
      },
      {
        instruction:
          "Tap 'Add App Password', name it 'PrettyMuch', and copy the xxxx-xxxx-xxxx-xxxx code it shows once",
      },
      {
        instruction:
          "Paste your handle and that app password below — never your real account password (an app password can be revoked on its own)",
      },
    ],
    checklist: [
      {
        key: "handle_ready",
        label: "Your Bluesky handle to hand",
        required: true,
      },
      {
        key: "app_password",
        label: "App password generated and copied",
        required: true,
      },
    ],
  },
  {
    id: "reddit",
    label: "Reddit",
    color: "#FF4500",
    bg: "bg-[#FF4500]/10",
    description: "Subreddit posts",
    accountType: "Any Reddit account with posting privileges",
    steps: [
      {
        instruction:
          "Make sure your account can post in the subreddit you're targeting — many require minimum karma or account age",
        link: { text: "Your Reddit profile", url: "https://www.reddit.com" },
      },
      {
        instruction:
          "Read that subreddit's rules — self-promotion is banned outright in many, and posts get removed without warning",
      },
      {
        instruction:
          "After connecting, choose the subreddit to post to (you can change it per post)",
      },
    ],
    checklist: [
      {
        key: "posting_allowed",
        label: "Account meets the subreddit's karma/age rules",
        required: true,
      },
      {
        key: "rules_read",
        label: "Subreddit allows this kind of post",
        required: true,
      },
    ],
  },
  {
    id: "gmb",
    label: "Google Business",
    color: "#4285F4",
    bg: "bg-[#4285F4]/10",
    description: "Local business posts",
    accountType: "Verified Google Business Profile",
    steps: [
      {
        instruction: "Create or claim your Google Business Profile",
        link: { text: "Google Business", url: "https://business.google.com" },
      },
      {
        instruction:
          "Complete the verification process (postcard, phone, or email)",
        link: {
          text: "Verify your business",
          url: "https://support.google.com/business/answer/2911778",
        },
      },
      { instruction: "Fill in your business hours, description, and category" },
      {
        instruction:
          "Add your business address and confirm the location is correct",
      },
    ],
    checklist: [
      {
        key: "profile_created",
        label: "Google Business Profile created",
        required: true,
      },
      {
        key: "verified",
        label: "Business verified with Google",
        required: true,
      },
      {
        key: "profile_complete",
        label: "Business hours and description filled in",
        required: false,
      },
    ],
  },
];

type ChecklistState = Record<string, Record<string, boolean>>;

function loadChecklist(workspaceSlug: string): ChecklistState {
  try {
    const raw = localStorage.getItem(
      `tenfold_social_checklist_${workspaceSlug}`,
    );
    return raw ? (JSON.parse(raw) as ChecklistState) : {};
  } catch {
    return {};
  }
}

function saveChecklist(workspaceSlug: string, state: ChecklistState) {
  try {
    localStorage.setItem(
      `tenfold_social_checklist_${workspaceSlug}`,
      JSON.stringify(state),
    );
  } catch {
    /* ignore */
  }
}

function platformInitials(label: string) {
  return label.split(/[\s/]/)[0].slice(0, 2).toUpperCase();
}

function PlatformCard({
  platform,
  profile,
  checklist,
  expanded,
  onToggle,
  onCheckItem,
  onConnect,
  connecting,
  onSwitchPage,
  onDisconnect,
  workspaceSlug,
  onDestinationSaved,
  unavailable,
  health,
  healthChecked = true,
}: {
  platform: PlatformGuide;
  profile: SocialProfile | undefined;
  /** What the provider says about this grant. Absent = not checked. */
  health?: ConnectionHealth;
  /** False until the health round-trip settles — see `checking` below. */
  healthChecked?: boolean;
  checklist: Record<string, boolean>;
  expanded: boolean;
  onToggle: () => void;
  onCheckItem: (key: string, value: boolean) => void;
  onConnect: () => void;
  connecting: boolean;
  /** Ayrshare unreachable — this network can't be connected right now. */
  unavailable?: boolean;
  onSwitchPage?: (pageId: string) => void;
  onDisconnect: () => void;
  workspaceSlug: string;
  onDestinationSaved: () => void;
}) {
  const connected = !!profile;
  // "unchecked" is not a fault — only an explicit verdict from the provider
  // turns the card red, so a network blip never invents an outage.
  const unhealthy = connected && isUnhealthy(health);
  // Verdict pending. Neutral on purpose — NOT a warning. We don't yet know
  // anything is wrong, and crying wolf for a second on every page load is its
  // own way of teaching people to ignore this. It only withholds the green.
  const checking = connected && !healthChecked && !unhealthy;
  const requiredItems = platform.checklist.filter((i) => i.required);
  const allRequiredChecked = requiredItems.every((i) => checklist[i.key]);
  const totalChecked = platform.checklist.filter(
    (i) => checklist[i.key],
  ).length;
  const totalItems = platform.checklist.length;
  // Connect is offered whenever the platform is connectable — the checklist no
  // longer gates it.
  //
  // It used to: the button did not render until the user ticked boxes like
  // "You are an Admin of the Page". Nothing verified any of those, so the ticks
  // proved nothing and the gate only delayed the one action that WOULD find
  // out. It also lived in localStorage, so a new browser silently took the
  // button away again.
  //
  // The checklist made sense when a bad grant surfaced weeks later at publish
  // time. It doesn't now: verifyPageToken() rejects a grant that can't publish
  // during the connect flow, and the health check catches one that dies later.
  // Real verification replaced the honour system; the honour system stayed
  // parked in front of the door. It remains above as guidance.
  const readyToConnect = !connected;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        unhealthy
          ? "border-destructive/30 bg-destructive/5"
          : connected
            ? "border-success/30 bg-success/5"
            : "border-border bg-card"
      }`}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
      >
        <div
          className={`w-10 h-10 rounded-xl ${platform.bg} flex items-center justify-center shrink-0`}
        >
          <span className="text-xs font-bold" style={{ color: platform.color }}>
            {platformInitials(platform.label)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {platform.label}
            </span>
            {/* The card collapses by default, so this tick is the ONLY thing
                most people ever read about this connection. A green one over a
                dead grant outranks every warning inside the card — which is
                exactly what it did for seven weeks. */}
            {unhealthy ? (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            ) : checking ? (
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground shrink-0 animate-spin" />
            ) : connected ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : allRequiredChecked ? (
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            )}
          </div>
          <p
            className={cn(
              "text-xs mt-0.5",
              unhealthy ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {unhealthy
              ? `${profile?.profile_display_name ?? profile?.handle ?? platform.label} — needs reconnecting`
              : checking
                ? `${profile?.profile_display_name ?? profile?.handle ?? platform.label} — checking…`
                : connected
                  ? (profile?.profile_display_name ??
                    profile?.handle ??
                    "Connected")
                  : platform.description}
          </p>
        </div>

        {/* Progress pill */}
        {!connected && (
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
              allRequiredChecked
                ? "text-primary border-primary/30 bg-primary/10"
                : "text-muted-foreground border-border bg-secondary"
            }`}
          >
            {totalChecked}/{totalItems} ready
          </span>
        )}

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded guide */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-5">
              {/* Account type requirement */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">
                    Account requirement:
                  </strong>{" "}
                  {platform.accountType}
                </p>
              </div>

              {/* Setup steps */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">
                  Setup steps
                </p>
                <ol className="space-y-2">
                  {platform.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-sm text-muted-foreground"
                    >
                      <span className="text-primary font-bold shrink-0 w-4">
                        {i + 1}.
                      </span>
                      <span className="leading-relaxed">
                        {step.instruction}
                        {step.link && (
                          <a
                            href={step.link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            {step.link.text}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Checklist */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">
                  Your checklist
                </p>
                <div className="space-y-2">
                  {platform.checklist.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        onCheckItem(item.key, !checklist[item.key])
                      }
                      className="w-full flex items-start gap-3 text-left group"
                    >
                      {checklist[item.key] ? (
                        <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
                      )}
                      <span
                        className={`text-sm leading-relaxed ${checklist[item.key] ? "text-foreground line-through opacity-60" : "text-muted-foreground"}`}
                      >
                        {item.label}
                        {item.required && !checklist[item.key] && (
                          <span className="ml-1 text-[10px] text-destructive font-medium">
                            required
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connect / connected state. A connection the provider has
                  since invalidated is NOT shown as healthy — that green tick
                  over a dead grant is what hid a seven-week publishing
                  outage. */}
              {connected ? (
                <div
                  className={cn(
                    "rounded-lg border",
                    unhealthy
                      ? "bg-destructive/5 border-destructive/30"
                      : "bg-success/5 border-success/20",
                  )}
                >
                  {unhealthy && (
                    <div className="flex items-start gap-2 border-b border-destructive/20 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div>
                        <p className="text-xs font-medium text-destructive">
                          This connection can&apos;t publish
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {health?.message}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          unhealthy ? "text-destructive" : "text-success",
                        )}
                      >
                        {unhealthy ? "Needs reconnecting" : "Connected"}
                      </p>
                      {(profile?.profile_display_name ?? profile?.handle) ? (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {profile?.profile_display_name ?? profile?.handle}
                        </p>
                      ) : profile?.source === "ayrshare" ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Linked and ready to publish
                        </p>
                      ) : null}
                      {/* Positive confirmation, not just the absence of red.
                          "Connected" on its own is the same claim the dead
                          grant made for seven weeks; this says who confirmed
                          it, how, and when — and names the weaker fallback as
                          weaker rather than letting it pass for the full
                          check. */}
                      {!unhealthy && health?.confirmation && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] text-success">
                          <ShieldCheck className="mt-px h-3 w-3 shrink-0" />
                          <span>
                            {health.confirmation}
                            {health.checkedVia === "page_read" && (
                              <span className="text-muted-foreground">
                                {" "}
                                Couldn&apos;t run the full permission check, so
                                this confirms the credential works — not that
                                the Page grant covers posting.
                              </span>
                            )}
                          </span>
                        </p>
                      )}
                      {!unhealthy &&
                        healthChecked &&
                        health?.status === "unchecked" && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Couldn&apos;t reach {platform.label} to verify this
                            connection just now — it may still work.
                          </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onConnect}
                        disabled={connecting}
                        className="gap-1.5 text-xs"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Manage
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDisconnect}
                        className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                  {/* Facebook Page picker — publish to the Page you choose. */}
                  {profile?.availablePages &&
                    profile.availablePages.length > 0 && (
                      <div className="flex flex-col gap-1 border-t border-success/20 px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          Publishing to this Page:
                        </span>
                        {profile.availablePages.length > 1 ? (
                          <select
                            value={profile.activePageId ?? ""}
                            onChange={(e) => onSwitchPage?.(e.target.value)}
                            className="text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {profile.availablePages.map((pg) => (
                              <option key={pg.id} value={pg.id}>
                                {pg.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium">
                            {profile.availablePages[0].name} — reconnect and
                            tick more Pages in Facebook to switch
                          </span>
                        )}
                      </div>
                    )}
                  {/* Reddit/Pinterest destination — a connection without one
                      looks healthy but can't publish, so it's shown here. */}
                  {profile &&
                    (platform.id === "reddit" ||
                      platform.id === "pinterest") && (
                      <DestinationPicker
                        platform={platform.id}
                        workspaceSlug={workspaceSlug}
                        current={profile.destination?.value ?? null}
                        boards={profile.availableBoards}
                        onSaved={onDestinationSaved}
                      />
                    )}
                </div>
              ) : unavailable ? (
                // A button that can only fail is worse than no button. This
                // network publishes solely through Ayrshare, which is off.
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {platform.label} isn&apos;t available at the moment — it
                    publishes through a provider that&apos;s currently
                    unavailable. Facebook, Instagram, Bluesky, Reddit, LinkedIn
                    and Pinterest connect directly and are unaffected.
                  </p>
                </div>
              ) : readyToConnect ? (
                <Button
                  onClick={onConnect}
                  disabled={connecting}
                  className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {connecting ? "Opening…" : `Connect ${platform.label}`}
                </Button>
              ) : null}

              {/* The refusal that happens BEFORE any permission screen.
                  Meta rejects a redirect URI that isn't on the app's allowlist
                  with a bare "URL Blocked" page and no route back — and
                  nothing in the product explained it, so it read as "the
                  button is broken". This is the one failure a user cannot
                  diagnose from the outside, so the diagnosis lives here. */}
              {!connected &&
                (platform.id === "facebook" || platform.id === "instagram") && (
                  <details className="rounded-lg border border-border bg-secondary/40 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                      Facebook says &ldquo;URL Blocked&rdquo;?
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                      <p>
                        That&apos;s the Meta app rejecting this site&apos;s
                        callback address before it shows you anything — nothing
                        to do with your account. A workspace admin fixes it once
                        in Meta&apos;s console.
                      </p>
                      <p>
                        Add this exact address to{" "}
                        <strong className="text-foreground">
                          Valid OAuth Redirect URIs
                        </strong>
                        :
                      </p>
                      <code className="block break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] text-foreground">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/api/social/callback/facebook`
                          : "/api/social/callback/facebook"}
                      </code>
                      <p>
                        It lives under{" "}
                        <strong className="text-foreground">
                          Facebook Login for Business → Settings
                        </strong>
                        , not the classic Facebook Login page. The same screen
                        has a Redirect URI Validator to confirm it.
                      </p>
                    </div>
                  </details>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Wizard: platform picker (step 1) ────────────────────────────────────────
function WizardPicker({
  selected,
  onToggle,
  onContinue,
  onSkip,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-serif text-foreground mb-1">
          Which platforms do you want to publish to?
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick the ones your customers use. You can add more later.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl border text-left transition-all",
                isSelected
                  ? "border-primary/60 bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-border/60",
              )}
            >
              <div
                className={`w-9 h-9 rounded-lg ${p.bg} flex items-center justify-center shrink-0`}
              >
                <span className="text-xs font-bold" style={{ color: p.color }}>
                  {platformInitials(p.label)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {p.label}
                </p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
              {isSelected && (
                <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={onContinue}
          disabled={selected.length === 0}
          className="gap-2 bg-primary hover:bg-primary/90 text-white"
        >
          Set up{" "}
          {selected.length > 0
            ? `${selected.length} platform${selected.length > 1 ? "s" : ""}`
            : "platforms"}
          <ArrowRight className="w-4 h-4" />
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip setup — I&apos;ll do this myself
        </button>
      </div>
    </div>
  );
}

// ── Wizard: per-platform guide (step 2+) ────────────────────────────────────
function WizardPlatformStep({
  platform,
  checklist,
  platformIdx,
  totalPlatforms,
  isConnected,
  health,
  healthChecked = true,
  isConnecting,
  onCheckItem,
  onConnect,
  onNext,
  onSkipPlatform,
  unavailable,
}: {
  platform: PlatformGuide;
  checklist: Record<string, boolean>;
  platformIdx: number;
  totalPlatforms: number;
  isConnected: boolean;
  /** The provider's verdict on an existing grant. Absent = never asked. */
  health?: ConnectionHealth;
  /** False until the health round-trip settles. */
  healthChecked?: boolean;
  isConnecting: boolean;
  onCheckItem: (key: string, value: boolean) => void;
  onConnect: () => void;
  onNext: () => void;
  onSkipPlatform: () => void;
  /** Ayrshare unreachable — offer Skip rather than a button that can't work. */
  unavailable?: boolean;
}) {
  const isLast = platformIdx === totalPlatforms - 1;
  // Re-running the wizard over a broken connection must not tick it off as
  // done — that's how someone "completes" setup and still can't publish.
  const brokenHere = isConnected && isUnhealthy(health);
  // Same rule as the cards: an unverified connection is not yet a success
  // story. This screen IS the verdict on whether setup worked, so it must not
  // hand out a tick it might have to take back.
  const checkingHere = isConnected && !healthChecked && !brokenHere;

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalPlatforms }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              i < platformIdx
                ? "bg-primary"
                : i === platformIdx
                  ? "bg-primary/40"
                  : "bg-border",
            )}
          />
        ))}
        <span className="text-xs text-muted-foreground font-mono ml-1 shrink-0">
          {platformIdx + 1}/{totalPlatforms}
        </span>
      </div>

      {/* Platform header */}
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-xl ${platform.bg} flex items-center justify-center shrink-0`}
        >
          <span className="text-sm font-bold" style={{ color: platform.color }}>
            {platformInitials(platform.label)}
          </span>
        </div>
        <div>
          <h2 className="text-xl font-bold font-serif text-foreground">
            {platform.label}
          </h2>
          <p className="text-sm text-muted-foreground">
            {platform.description}
          </p>
        </div>
        {brokenHere ? (
          <AlertCircle className="w-5 h-5 text-destructive ml-auto shrink-0" />
        ) : checkingHere ? (
          <RefreshCw className="w-4 h-4 text-muted-foreground ml-auto shrink-0 animate-spin" />
        ) : isConnected ? (
          <CheckCircle2 className="w-5 h-5 text-success ml-auto shrink-0" />
        ) : null}
      </div>

      {/* Account type requirement */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Before you connect:</strong>{" "}
          {platform.accountType}
        </p>
      </div>

      {/* Setup steps */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-3">
          Setup steps
        </p>
        <ol className="space-y-3">
          {platform.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
              <span className="text-primary font-bold shrink-0 w-5">
                {i + 1}.
              </span>
              <span className="leading-relaxed">
                {step.instruction}
                {step.link && (
                  <a
                    href={step.link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    {step.link.text}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Checklist */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-3">
          Tick these off before connecting
        </p>
        <div className="space-y-2.5">
          {platform.checklist.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onCheckItem(item.key, !checklist[item.key])}
              className="w-full flex items-start gap-3 text-left group"
            >
              {checklist[item.key] ? (
                <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              ) : (
                <Square className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
              )}
              <span
                className={`text-sm leading-relaxed ${checklist[item.key] ? "text-foreground line-through opacity-60" : "text-muted-foreground"}`}
              >
                {item.label}
                {item.required && !checklist[item.key] && (
                  <span className="ml-1 text-[10px] text-destructive font-medium">
                    required
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Ayrshare handoff — this is where PrettyMuch hands control to Ayrshare */}
      {brokenHere ? (
        // Promising a publish target we already know is refused is the whole
        // bug, and it is worst here — this is the screen a new user trusts to
        // tell them setup worked.
        <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <p className="text-sm font-semibold text-destructive">
              {platform.label} needs reconnecting
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {health?.message ??
              "This connection can't publish right now. Reconnect it to continue."}
          </p>
          <Button
            size="sm"
            onClick={onConnect}
            disabled={isConnecting || unavailable}
            className="mt-3 gap-1.5"
          >
            {isConnecting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5" />
            )}
            Reconnect {platform.label}
          </Button>
        </div>
      ) : checkingHere ? (
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
            <p className="text-sm font-semibold text-foreground">
              Checking {platform.label}…
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Confirming with {platform.label} that this connection can still
            publish.
          </p>
        </div>
      ) : isConnected ? (
        <div className="p-4 rounded-xl bg-success/5 border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <p className="text-sm font-semibold text-success">
              {platform.label} connected
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            PrettyMuch will publish to this account when you hit publish on a
            campaign.
          </p>
        </div>
      ) : (
        // Always offered — the checklist above is guidance, not a gate. See the
        // note on `readyToConnect` in PlatformCard for why it stopped being one.
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-sm font-medium text-foreground mb-1">
              Ready to connect
            </p>
            <p className="text-xs text-muted-foreground">
              A secure window will open where you log in to {platform.label}.
              PrettyMuch never sees your password — it&apos;s handled securely.
            </p>
          </div>
          {unavailable ? (
            // Don't march someone through a wizard step that dead-ends. Tell
            // them, and let them move on to a network that does work.
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {platform.label} isn&apos;t available at the moment. Skip it for
                now — Facebook, Instagram, Bluesky, Reddit and Pinterest connect
                directly and are unaffected.
              </p>
            </div>
          ) : (
            <Button
              onClick={onConnect}
              disabled={isConnecting}
              className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {isConnecting
                ? "Opening secure window…"
                : `Connect ${platform.label}`}
            </Button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onSkipPlatform}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isConnected ? "" : "Skip for now"}
        </button>
        {/* Always available. It used to hide once the checklist was complete,
            on the assumption the user would connect instead — which stranded
            anyone who ticked the boxes and then decided to skip. */}
        <Button
          onClick={onNext}
          variant={isConnected ? "default" : "outline"}
          className="gap-2"
        >
          {isLast ? "Finish setup" : "Next platform"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function SocialSettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceSlug = params.workspace as string;

  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  // A row in social_profiles proves someone once connected, not that the
  // connection still works — a dead grant showed a healthy green card here for
  // seven weeks. Fetched separately from the profiles so a slow Meta round-trip
  // never delays the connections rendering.
  const [health, setHealth] = useState<Record<string, ConnectionHealth>>({});
  // Has the health round-trip SETTLED? An empty `health` map can't answer that
  // — it reads the same before the request lands as it does when every grant
  // came back fine. Without this the page painted its confident green state
  // for the second or two before Meta replied, which is the same lie this
  // whole check exists to stop, just briefer.
  const [healthChecked, setHealthChecked] = useState(false);
  // A disconnect we could not revoke at the provider. Held in a dismissible
  // banner, not just a toast: the user has an action left to take, and a toast
  // that vanishes after eight seconds is the wrong home for the only
  // instruction that actually cuts off access.
  // A connect attempt that came back with an error. Persistent, because the
  // fix is an instruction the user has to act on — see the note at the setter.
  const [connectError, setConnectError] = useState<{
    platform: string;
    title: string;
    body: string;
    fix: string;
  } | null>(null);
  // Set when the Publish rail sent us here, so we can offer a route home.
  // Falls back to sessionStorage because an OAuth round trip replaces the URL
  // entirely — the provider redirects to ?connected=… and the query param we
  // arrived with is gone, taking the only route back to the project with it.
  const [returnCampaignId, setReturnCampaignId] = useState<string | null>(null);
  useEffect(() => {
    const fromUrl = searchParams.get("from");
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("tf_connect_return");
    } catch {
      // Private mode or blocked storage — the link just won't appear.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL/storage on mount
    setReturnCampaignId(fromUrl ?? stored);
  }, [searchParams]);
  const [pendingRevoke, setPendingRevoke] = useState<{
    label: string;
    message: string;
    manualUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ayrshareLoading, setAyrshareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  // Bluesky connects via a credential form, not an OAuth redirect.
  const [blueskyOpen, setBlueskyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});

  // Wizard state
  // True once we know Ayrshare can't be reached — drives the "unavailable"
  // treatment on the eight networks that only publish through it.
  const [ayrshareDown, setAyrshareDown] = useState(false);
  const [wizardMode, setWizardMode] = useState<"picker" | "platform" | null>(
    null,
  );
  const [wizardPlatforms, setWizardPlatforms] = useState<string[]>([]);
  const [wizardIdx, setWizardIdx] = useState(0);

  // Load checklist from localStorage once workspaceSlug is available
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (workspaceSlug) setChecklist(loadChecklist(workspaceSlug));
  }, [workspaceSlug]);

  // Auto-show wizard for first-time users (no connections + wizard never completed)
  useEffect(() => {
    if (loading || !workspaceSlug) return;
    const done = localStorage.getItem(`tenfold_wizard_done_${workspaceSlug}`);
    if (!done && profiles.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWizardMode("picker");
    }
    // Run once after first successful load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const fetchProfiles = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await api("/api/social/profiles", { workspaceSlug });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Failed to load (${res.status})`);
        }
        setProfiles((await res.json()) as SocialProfile[]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceSlug],
  );

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api("/api/social/health", { workspaceSlug });
      if (!res.ok) return; // Health is advisory — never block the page on it.
      setHealth((await res.json()) as Record<string, ConnectionHealth>);
    } catch {
      // Same reasoning: an unreachable check reports nothing, not a fault.
    } finally {
      // Settles on failure too, deliberately. A check we couldn't run is
      // "unchecked", which renders as it always did — leaving the page stuck
      // on "Checking…" forever would be a worse lie than the one we fixed.
      setHealthChecked(true);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of connected profiles
    fetchProfiles();
    void fetchHealth();
  }, [fetchProfiles, fetchHealth]);

  // Re-check connections whenever the user returns to this tab. Ayrshare linking
  // happens in a separate tab, so on refocus we quietly re-fetch to reflect what
  // they just linked — no more "did it actually connect?" limbo.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchProfiles(true);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchProfiles]);

  // Handle OAuth redirect params (?connected=... or ?error=...) from every
  // connect flow, not just Meta's.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reading the OAuth
       result out of the URL is inherently a mount-time side effect: the params
       only exist because a provider just redirected here, and the banner they
       produce has to survive the router.replace that cleans them off. */
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (!connected && !oauthError) return;

    if (connected) {
      const platforms = connected.split(",");
      const label = platforms
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" & ");
      toast.success(`${label} connected successfully`);
    }
    // Every callback reports back as `<platform>_denied` / `<platform>_failed`,
    // so match that shape instead of naming each network one by one: Reddit and
    // LinkedIn bounced back here silently for as long as only Facebook's three
    // codes were listed, which reads to the user as the button doing nothing.
    if (oauthError) {
      // A code with no underscore isn't one of ours; treat the whole string as
      // the platform so the toast still names something rather than a slice of
      // the wrong end of it.
      const separator = oauthError.indexOf("_");
      const platformId =
        separator === -1 ? oauthError : oauthError.slice(0, separator);
      const reason = separator === -1 ? "" : oauthError.slice(separator + 1);
      const label =
        PLATFORMS.find((p) => p.id === platformId)?.label ??
        platformId.charAt(0).toUpperCase() + platformId.slice(1);

      // A failed connect gets a PERSISTENT banner, not just a toast.
      //
      // The toast fired, `router.replace` stripped the error param, and four
      // seconds later there was no trace — so a connect that failed looked
      // exactly like a connect that never ran ("it spins back like nothing
      // happened"). The instruction that would actually fix it cannot live in
      // something that disappears while the user is still reading the page.
      if (reason === "no_pages")
        setConnectError({
          platform: label,
          // The old copy said "create a Page first", which is wrong and
          // misleading for the common case: the user HAS a Page, Facebook
          // just didn't include it in the grant.
          title: `Facebook didn't share any Pages`,
          body: "Facebook completed the login but returned no Pages, so there was nothing to connect. This usually means the permission screen reused your previous choices instead of asking again.",
          fix: 'Reconnect, and on Facebook\'s screen choose "Edit settings" (not "Continue") — then tick the Page you publish from.',
        });
      else if (reason === "page_unverified")
        setConnectError({
          platform: label,
          title: "Facebook didn't grant access to that Page",
          body: "The login worked, but the permissions don't cover the Page we'd publish to.",
          fix: 'Reconnect and choose "Edit settings", then tick that Page in the permissions step.',
        });
      else if (reason === "denied")
        toast.error(`${label} connection cancelled`);
      // Anything unrecognised still surfaces — silence is the worse failure.
      else
        setConnectError({
          platform: label,
          title: `${label} connection failed`,
          body: "Something went wrong partway through the connection.",
          fix: "Try connecting again. If it keeps failing, check the platform's own app settings.",
        });
    }

    // Clean the URL without causing a navigation
    // Preserve `from` — stripping it would delete the only route back to the
    // project the moment an OAuth error param was cleaned up.
    const keep = searchParams.get("from");
    router.replace(
      `/${workspaceSlug}/settings/social${keep ? `?from=${encodeURIComponent(keep)}` : ""}`,
      { scroll: false },
    );
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Start an OAuth flow by navigating this tab.
   *
   * This briefly opened a new tab instead, so that a provider refusing before
   * its permission screen (Meta's "URL Blocked") left the settings page alive
   * underneath. That was wrong twice over.
   *
   * The mechanism was broken: `window.open(url, "_blank", "noopener")` returns
   * null BY SPEC — noopener severs the handle — so the `if (!tab)` fallback
   * fired on every click and the page navigated as well. Two navigations to
   * the same OAuth URL raced each other, and the visible result was a click
   * that bounced and connected nothing.
   *
   * And the reason had expired: the redirect URI is allowlisted now, so the
   * dead end it defended against no longer happens. A plain navigation is what
   * every other OAuth flow in this app does, and it is the one thing a popup
   * blocker cannot silently eat.
   *
   * `from` is stashed first so the trip through Facebook doesn't lose the
   * project someone came here from — sessionStorage survives the round trip
   * that in-memory state cannot.
   */
  const openConnectFlow = (path: string) => {
    try {
      const from = searchParams.get("from");
      if (from) sessionStorage.setItem("tf_connect_return", from);
    } catch {
      // A blocked sessionStorage costs the return link, not the connect.
    }
    window.location.href = path;
  };

  const handleConnect = (platformId: string) => {
    setConnecting(platformId);
    // Facebook and Instagram use direct Meta OAuth — the connect route
    // redirects to Meta, which redirects back to /api/social/callback/facebook.
    if (platformId === "facebook" || platformId === "instagram") {
      openConnectFlow(
        `/api/social/connect/facebook?workspace=${workspaceSlug}`,
      );
      return;
    }

    // Bluesky has no OAuth at all — the user pastes a handle + app password, so
    // it opens a form here instead of navigating anywhere.
    if (platformId === "bluesky") {
      setBlueskyOpen(true);
      setConnecting(null);
      return;
    }

    // Our own OAuth apps (CLAUDE.md §7d direct backend). LinkedIn joined these
    // when Ayrshare stopped being an option — member feed only, see
    // lib/social/direct/linkedin.ts.
    if (
      platformId === "reddit" ||
      platformId === "pinterest" ||
      platformId === "linkedin" ||
      platformId === "tiktok" ||
      platformId === "youtube"
    ) {
      openConnectFlow(
        `/api/social/connect/${platformId}?workspace=${workspaceSlug}`,
      );
      return;
    }

    // Everything left (X, LinkedIn, TikTok, YouTube, …) still needs Ayrshare.
    handleAyrshareConnect().finally(() => setConnecting(null));
  };

  // Open Ayrshare's hosted linking page (creates the workspace's Ayrshare
  // profile on first use, then returns an SSO URL to connect socials).
  const handleAyrshareConnect = async () => {
    setAyrshareLoading(true);
    // Open the tab synchronously on the click so popup blockers allow it; we set
    // its URL once the connect endpoint returns. Linking in a separate tab means
    // Ayrshare's unreliable "Close" button can't strand the user — their PrettyMuch
    // tab stays put and re-checks connections on refocus.
    const linkTab = window.open("about:blank", "_blank");
    try {
      const res = await api("/api/social/connect", { workspaceSlug });
      const data = (await res.json().catch(() => ({}))) as {
        connectUrl?: string;
        error?: string;
        ayrshareDisabled?: boolean;
      };
      if (data.ayrshareDisabled) {
        linkTab?.close();
        setAyrshareDown(true);
        toast.error(
          "X, LinkedIn, TikTok and YouTube aren't available right now. Facebook, Instagram, Bluesky, Reddit and Pinterest connect directly and still work.",
        );
        return;
      }
      if (!res.ok || !data.connectUrl)
        throw new Error(data.error ?? "Could not start the connection");
      if (linkTab) linkTab.location.href = data.connectUrl;
      else window.location.href = data.connectUrl; // popup blocked → same tab
    } catch (err) {
      linkTab?.close();
      const msg = (err as Error).message ?? "";
      // Ayrshare switched off (or its account suspended — code 276) is not a
      // transient failure the user can retry past. Say what still works
      // instead of inviting them to try a dead button again.
      if (/switched off|suspended|\b276\b/i.test(msg)) {
        setAyrshareDown(true);
        toast.error(
          "X, LinkedIn, TikTok and YouTube aren't available right now. Facebook, Instagram, Bluesky, Reddit and Pinterest connect directly and still work.",
        );
      }
      // Ayrshare returns 403 code 167 when the account isn't on the Business Plan.
      else if (/business plan|\b167\b/i.test(msg)) {
        setNeedsUpgrade(true);
        toast.error(
          "Connecting more networks needs the Ayrshare Business Plan — Facebook & Instagram are free and ready.",
        );
      } else {
        toast.error(msg || "Could not connect your socials — try again");
      }
    } finally {
      setAyrshareLoading(false);
    }
  };

  // Disconnect a platform: native (FB/IG) drops the row, others unlink from
  // Ayrshare. Confirm first — it revokes publishing to that account.
  const disconnectPlatform = async (platformId: string, label: string) => {
    if (
      !window.confirm(
        `Disconnect ${label}? PrettyMuch will no longer be able to publish to it until you reconnect.`,
      )
    )
      return;
    try {
      const res = await api("/api/social/disconnect", {
        method: "POST",
        body: JSON.stringify({ platform: platformId }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        revocations?: Record<
          string,
          { status: string; message: string; manualUrl?: string }
        >;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      // Say what actually happened at the PROVIDER, not just here.
      //
      // "Disconnected" alone is the reassurance someone acts on when they
      // think a token has leaked — and for most networks it only means we
      // deleted our copy while the grant stayed live. If we couldn't revoke
      // it, the follow-up step is the whole point of the message, so it gets
      // a long toast and the link rather than a cheerful one-liner.
      const outcome = data.revocations?.[platformId];
      if (outcome && outcome.status !== "revoked") {
        setPendingRevoke({
          label,
          message: outcome.message,
          manualUrl: outcome.manualUrl,
        });
        toast(`${label} removed — one more step to fully revoke access`, {
          icon: "⚠️",
          duration: 8000,
        });
      } else {
        toast.success(
          outcome?.status === "revoked"
            ? `${label} disconnected and access revoked`
            : `${label} disconnected`,
        );
      }
      fetchProfiles(true);
    } catch (err) {
      toast.error((err as Error).message ?? "Could not disconnect");
    }
  };

  // Switch which Facebook Page PrettyMuch publishes to (no re-auth — pages were
  // stored at connect time).
  const switchFbPage = async (pageId: string) => {
    try {
      const res = await api("/api/social/facebook/page", {
        method: "POST",
        body: JSON.stringify({ pageId }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        page?: { name: string };
        error?: string;
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not switch Page");
      toast.success(
        `Now publishing to ${data.page?.name ?? "the selected Page"}`,
      );
      fetchProfiles(true);
    } catch (err) {
      toast.error((err as Error).message ?? "Could not switch Page");
    }
  };

  const handleCheckItem = (
    platformId: string,
    itemKey: string,
    value: boolean,
  ) => {
    setChecklist((prev) => {
      const next = {
        ...prev,
        [platformId]: { ...(prev[platformId] ?? {}), [itemKey]: value },
      };
      saveChecklist(workspaceSlug, next);
      return next;
    });
  };

  const dismissWizard = (markDone = true) => {
    if (markDone)
      localStorage.setItem(`tenfold_wizard_done_${workspaceSlug}`, "1");
    setWizardMode(null);
    setWizardPlatforms([]);
    setWizardIdx(0);
  };

  const wizardCurrentPlatformId = wizardPlatforms[wizardIdx];
  const wizardCurrentPlatform = PLATFORMS.find(
    (p) => p.id === wizardCurrentPlatformId,
  );

  const handleWizardNext = () => {
    if (wizardIdx < wizardPlatforms.length - 1) {
      setWizardIdx((i) => i + 1);
    } else {
      dismissWizard();
    }
  };

  const connectedIds = new Set(profiles.map((p) => p.platform));
  const connectedCount = PLATFORMS.filter((p) => connectedIds.has(p.id)).length;
  // Connected but refused by the provider. `connectedCount` counts ROWS, which
  // is the wrong thing to celebrate — the summary below used it to promise
  // "you're ready to publish" over grants Meta had already invalidated.
  const brokenPlatforms = PLATFORMS.filter(
    (p) => connectedIds.has(p.id) && isUnhealthy(health[p.id]),
  );
  const publishableCount = connectedCount - brokenPlatforms.length;
  const brokenNames = brokenPlatforms.map((p) => p.label).join(", ");
  // Connections exist but the provider hasn't answered yet. Withhold the
  // confident green rather than assert it and correct a second later — the
  // whole point is that this page never claims more than it knows.
  const checkingConnections = connectedCount > 0 && !healthChecked;
  const progressPct = Math.round((connectedCount / PLATFORMS.length) * 100);
  const fbProfile = profiles.find((p) => p.platform === "facebook");

  return (
    <div className="max-w-2xl">
      {/* ── Wizard overlay ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {wizardMode && (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mb-10 p-6 rounded-2xl border border-primary/20 bg-card shadow-sm relative"
          >
            {/* Dismiss */}
            <button
              type="button"
              onClick={() => dismissWizard()}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              title="Close wizard"
            >
              <X className="w-4 h-4" />
            </button>

            {wizardMode === "picker" && (
              <WizardPicker
                selected={wizardPlatforms}
                onToggle={(id) =>
                  setWizardPlatforms((prev) =>
                    prev.includes(id)
                      ? prev.filter((p) => p !== id)
                      : [...prev, id],
                  )
                }
                onContinue={() => {
                  setWizardIdx(0);
                  setWizardMode("platform");
                }}
                onSkip={() => dismissWizard()}
              />
            )}

            {wizardMode === "platform" && wizardCurrentPlatform && (
              <>
                <WizardPlatformStep
                  platform={wizardCurrentPlatform}
                  checklist={checklist[wizardCurrentPlatformId] ?? {}}
                  platformIdx={wizardIdx}
                  totalPlatforms={wizardPlatforms.length}
                  isConnected={connectedIds.has(wizardCurrentPlatformId)}
                  health={health[wizardCurrentPlatformId]}
                  healthChecked={healthChecked}
                  isConnecting={connecting === wizardCurrentPlatformId}
                  onCheckItem={(key, value) =>
                    handleCheckItem(wizardCurrentPlatformId, key, value)
                  }
                  onConnect={() => handleConnect(wizardCurrentPlatformId)}
                  unavailable={
                    ayrshareDown && AYRSHARE_ONLY.has(wizardCurrentPlatformId)
                  }
                  onNext={handleWizardNext}
                  onSkipPlatform={handleWizardNext}
                />

                {/* Errors shown inside the wizard so they're not missed */}
                {error && (
                  <div className="mt-4 flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">
                        Connection failed
                      </p>
                      <p className="text-xs text-destructive/80 mt-0.5">
                        {error}
                      </p>
                    </div>
                  </div>
                )}
                {needsUpgrade && (
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      This network isn&apos;t available yet
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Facebook &amp; Instagram are ready to connect now — the
                      other networks are rolling out shortly. Hang tight!
                    </p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
            Social Connections
          </h1>
          <p className="text-muted-foreground text-sm">
            Connect an account and PrettyMuch can publish to it. Each one shows
            what it needs and whether it still works — we check with the
            provider, not just whether it&apos;s listed here.
          </p>
          {/* The way back. Studio keeps the open project in memory, so anyone
              sent here from the Publish rail had no route home except the
              generic "Back to workspace", which starts a fresh brief — their
              campaign appeared to have been thrown away. `from` carries the id
              and ?openProject rehydrates it, the same path the Gallery and
              Productions pages use. */}
          {returnCampaignId && (
            <Link
              href={`/${workspaceSlug}?openProject=${returnCampaignId}&section=publish`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to your project
            </Link>
          )}
        </div>
        {!wizardMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setWizardPlatforms([]);
              setWizardMode("picker");
            }}
            className="gap-1.5 shrink-0 text-xs"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Setup wizard
          </Button>
        )}
      </div>

      {/* Connect the remaining networks (everything beyond Facebook & Instagram) */}
      <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground mb-0.5">
            More networks — X, LinkedIn, TikTok, YouTube, Pinterest & more
          </p>
          <p className="text-xs text-muted-foreground">
            Facebook &amp; Instagram connect above (free). Connect everything
            else through PrettyMuch in one place — a Pro feature.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleAyrshareConnect}
          disabled={ayrshareLoading}
          className="gap-1.5 shrink-0 bg-primary hover:bg-primary/90 text-white"
        >
          {ayrshareLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ExternalLink className="w-3.5 h-3.5" />
          )}
          Connect your socials
        </Button>
      </div>

      {/* A connect that came back with an error. Above everything, and it
          stays until dismissed — the whole failure of the old toast was that
          it took the fix with it. */}
      {connectError && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {connectError.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {connectError.body}
              </p>
              <p className="mt-2 text-xs font-medium text-foreground">
                {connectError.fix}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConnectError(null)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Unfinished revocation. Sits above everything, because the user asked
          to cut off access and it is not cut off yet. */}
      {pendingRevoke && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {pendingRevoke.label} is removed here — but still authorised on
                your account
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pendingRevoke.message}
              </p>
              {pendingRevoke.manualUrl && (
                <a
                  href={pendingRevoke.manualUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Remove PrettyMuch on {pendingRevoke.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPendingRevoke(null)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Connected platforms summary */}
      {!loading && connectedCount > 0 && (
        <div
          className={cn(
            "mb-6 p-4 rounded-xl border",
            checkingConnections
              ? "border-border bg-card"
              : publishableCount === 0
                ? "border-destructive/30 bg-destructive/5"
                : "border-success/30 bg-success/5",
          )}
        >
          {/* This block sits above every card and is the first thing read, so
              it must never be greener than the truth underneath it. When
              nothing can publish it stops calling itself "Connected" at all —
              a row in social_profiles is not a working connection. */}
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-wider font-mono mb-3",
              checkingConnections
                ? "text-muted-foreground"
                : publishableCount === 0
                  ? "text-destructive"
                  : "text-success",
            )}
          >
            {checkingConnections
              ? "Checking connections…"
              : publishableCount === 0
                ? "Needs reconnecting"
                : "Connected"}
          </p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.filter((p) => connectedIds.has(p.id)).map((p) => {
              const profile = profiles.find((pr) => pr.platform === p.id);
              const broken = isUnhealthy(health[p.id]);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border",
                    broken
                      ? "border-destructive/40"
                      : checkingConnections
                        ? "border-border"
                        : "border-success/20",
                  )}
                >
                  <div
                    className={`w-4 h-4 rounded-full ${p.bg} flex items-center justify-center`}
                  >
                    <span
                      className="text-[8px] font-bold"
                      style={{ color: p.color }}
                    >
                      {platformInitials(p.label)}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    {p.label}
                  </span>
                  {(profile?.profile_display_name ?? profile?.handle) && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {profile?.profile_display_name ?? profile?.handle}
                    </span>
                  )}
                  {broken ? (
                    <AlertCircle className="w-3 h-3 text-destructive" />
                  ) : checkingConnections ? (
                    <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-success" />
                  )}
                </div>
              );
            })}
          </div>
          {fbProfile?.availablePages && fbProfile.availablePages.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-success/20 pt-3">
              <span className="text-xs text-muted-foreground shrink-0">
                Publishing to Page:
              </span>
              {fbProfile.availablePages.length > 1 ? (
                <select
                  value={fbProfile.activePageId ?? ""}
                  onChange={(e) => switchFbPage(e.target.value)}
                  className="text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {fbProfile.availablePages.map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-medium">
                  {fbProfile.availablePages[0].name}
                </span>
              )}
            </div>
          )}
          <div
            className={cn(
              "mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t pt-3",
              checkingConnections
                ? "border-border"
                : publishableCount === 0
                  ? "border-destructive/20"
                  : "border-success/20",
            )}
          >
            {/* Three states, because "some of your accounts are broken" is a
                different message from "all of them are", and both are
                different from the happy path. The old copy only knew the
                happy one and said it unconditionally. */}
            {checkingConnections ? (
              <p className="text-xs text-muted-foreground">
                Checking with each provider that your connected{" "}
                {connectedCount === 1 ? "account" : "accounts"} can still
                publish…
              </p>
            ) : publishableCount === 0 ? (
              <p className="text-xs text-destructive">
                {brokenNames} can&apos;t publish —{" "}
                {brokenPlatforms.length === 1
                  ? "the account below needs"
                  : "the accounts below need"}{" "}
                reconnecting before a campaign can go anywhere.
              </p>
            ) : brokenPlatforms.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                ✓ Ready to publish to {publishableCount}{" "}
                {publishableCount === 1 ? "account" : "accounts"} —{" "}
                <span className="text-destructive">
                  {brokenNames} can&apos;t publish until reconnected.
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                ✓ You&apos;re ready to publish to your connected{" "}
                {connectedCount === 1 ? "account" : "accounts"}. Create a
                campaign and it&apos;ll be a publish target.
              </p>
            )}
            <Button
              size="sm"
              variant={
                publishableCount === 0 && !checkingConnections
                  ? "outline"
                  : "default"
              }
              onClick={() => router.push(`/${workspaceSlug}`)}
              className="shrink-0"
            >
              Create a campaign
            </Button>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="mb-6 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            {loading
              ? "Loading…"
              : `${connectedCount} of ${PLATFORMS.length} platforms connected`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchProfiles(true)}
            disabled={refreshing || loading}
            className="gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
          >
            <RefreshCw
              className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progressPct}%`,
              background:
                connectedCount === PLATFORMS.length
                  ? "var(--color-success)"
                  : "var(--color-primary)",
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Connection error
            </p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Multi-network availability notice (shown when the broader networks
          aren't enabled on the account yet) */}
      {needsUpgrade && (
        <div className="mb-4 p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">
                More networks are rolling out
              </p>
              <p className="text-sm text-muted-foreground">
                Facebook &amp; Instagram are ready to connect now. The other
                networks (X, LinkedIn, TikTok, YouTube, Pinterest &amp; more)
                are coming to your plan shortly — check back soon.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Platform cards */}
      <div className="space-y-3">
        {PLATFORMS.map((platform, i) => (
          <motion.div
            key={platform.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
          >
            <PlatformCard
              platform={platform}
              profile={profiles.find((p) => p.platform === platform.id)}
              checklist={checklist[platform.id] ?? {}}
              expanded={expanded === platform.id}
              onToggle={() =>
                setExpanded((prev) =>
                  prev === platform.id ? null : platform.id,
                )
              }
              onCheckItem={(key, value) =>
                handleCheckItem(platform.id, key, value)
              }
              onConnect={() => handleConnect(platform.id)}
              unavailable={ayrshareDown && AYRSHARE_ONLY.has(platform.id)}
              health={health[platform.id]}
              healthChecked={healthChecked}
              connecting={connecting === platform.id}
              onSwitchPage={
                platform.id === "facebook" ? switchFbPage : undefined
              }
              onDisconnect={() =>
                disconnectPlatform(platform.id, platform.label)
              }
              workspaceSlug={workspaceSlug}
              onDestinationSaved={() => fetchProfiles(true)}
            />
          </motion.div>
        ))}
      </div>

      {/* How it works */}
      <div className="mt-8 p-5 bg-card border border-border rounded-xl">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          How connecting works
        </h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>
            Open a platform to see what it needs — the checklist is guidance,
            not a gate, so you can connect whenever you&apos;re ready
          </li>
          <li>
            Click{" "}
            <strong className="text-foreground">Connect [Platform]</strong> — a
            secure window opens
          </li>
          <li>Log in to the platform inside that window, then close it</li>
          <li>
            PrettyMuch detects the closure and refreshes your connection status
            automatically
          </li>
        </ol>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Connections are managed securely by PrettyMuch. We never store your
          social passwords.
        </p>
      </div>

      {blueskyOpen && (
        <BlueskyConnectDialog
          workspaceSlug={workspaceSlug}
          onClose={() => setBlueskyOpen(false)}
          onConnected={() => fetchProfiles(true)}
        />
      )}
    </div>
  );
}
