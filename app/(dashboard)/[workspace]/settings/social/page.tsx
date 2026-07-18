"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  CheckCircle2,
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

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  connected_at: string | null;
  /** How it was linked: direct Meta OAuth ("native") or Ayrshare's hosted flow. */
  source?: "native" | "ayrshare";
  /** Facebook only: which Page is active + all managed Pages for the picker. */
  activePageId?: string | null;
  availablePages?: { id: string; name: string }[];
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
}: {
  platform: PlatformGuide;
  profile: SocialProfile | undefined;
  checklist: Record<string, boolean>;
  expanded: boolean;
  onToggle: () => void;
  onCheckItem: (key: string, value: boolean) => void;
  onConnect: () => void;
  connecting: boolean;
  onSwitchPage?: (pageId: string) => void;
}) {
  const connected = !!profile;
  const requiredItems = platform.checklist.filter((i) => i.required);
  const allRequiredChecked = requiredItems.every((i) => checklist[i.key]);
  const totalChecked = platform.checklist.filter(
    (i) => checklist[i.key],
  ).length;
  const totalItems = platform.checklist.length;
  const readyToConnect = allRequiredChecked && !connected;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        connected ? "border-success/30 bg-success/5" : "border-border bg-card"
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
            {connected ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : allRequiredChecked ? (
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {connected
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

              {/* Connect / connected state */}
              {connected ? (
                <div className="rounded-lg bg-success/5 border border-success/20">
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium text-success">
                        Connected
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
                    </div>
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
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
                  <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Complete all{" "}
                    <strong className="text-foreground">required</strong>{" "}
                    checklist items above to unlock the connect button
                  </p>
                </div>
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
  isConnecting,
  onCheckItem,
  onConnect,
  onNext,
  onSkipPlatform,
}: {
  platform: PlatformGuide;
  checklist: Record<string, boolean>;
  platformIdx: number;
  totalPlatforms: number;
  isConnected: boolean;
  isConnecting: boolean;
  onCheckItem: (key: string, value: boolean) => void;
  onConnect: () => void;
  onNext: () => void;
  onSkipPlatform: () => void;
}) {
  const requiredItems = platform.checklist.filter((i) => i.required);
  const allRequiredChecked = requiredItems.every((i) => checklist[i.key]);
  const isLast = platformIdx === totalPlatforms - 1;

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
        {isConnected && (
          <CheckCircle2 className="w-5 h-5 text-success ml-auto shrink-0" />
        )}
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

      {/* Ayrshare handoff — this is where Tenfold hands control to Ayrshare */}
      {isConnected ? (
        <div className="p-4 rounded-xl bg-success/5 border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <p className="text-sm font-semibold text-success">
              {platform.label} connected
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Tenfold will publish to this account when you hit publish on a
            campaign.
          </p>
        </div>
      ) : allRequiredChecked ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-sm font-medium text-foreground mb-1">
              Ready to connect
            </p>
            <p className="text-xs text-muted-foreground">
              A secure window will open where you log in to {platform.label}.
              Tenfold never sees your password — it&apos;s handled securely.
            </p>
          </div>
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
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
          <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Tick all <strong className="text-foreground">required</strong> items
            above, then the connect button appears.
          </p>
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
        {(isConnected || !allRequiredChecked) && (
          <Button
            onClick={onNext}
            variant={isConnected ? "default" : "outline"}
            className="gap-2"
          >
            {isLast ? "Finish setup" : "Next platform"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
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
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ayrshareLoading, setAyrshareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});

  // Wizard state
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of connected profiles
    fetchProfiles();
  }, [fetchProfiles]);

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

  // Handle Meta OAuth redirect params (?connected=... or ?error=...)
  useEffect(() => {
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
    if (oauthError === "facebook_denied")
      toast.error("Facebook connection cancelled");
    if (oauthError === "facebook_no_pages")
      toast.error(
        "No Facebook Pages found — create a Page first, then reconnect",
      );
    if (oauthError === "facebook_failed")
      toast.error("Facebook connection failed — please try again");

    // Clean the URL without causing a navigation
    router.replace(`/${workspaceSlug}/settings/social`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = (platformId: string) => {
    // Facebook and Instagram use direct Meta OAuth — navigate to the connect route.
    // The route redirects to Meta, which redirects back to /api/social/callback/facebook.
    if (platformId === "facebook" || platformId === "instagram") {
      // eslint-disable-next-line react-hooks/immutability -- intentional full-page navigation to start Meta OAuth
      window.location.href = `/api/social/connect/facebook?workspace=${workspaceSlug}`;
      return;
    }

    // Every other network connects through Ayrshare.
    handleAyrshareConnect();
  };

  // Open Ayrshare's hosted linking page (creates the workspace's Ayrshare
  // profile on first use, then returns an SSO URL to connect socials).
  const handleAyrshareConnect = async () => {
    setAyrshareLoading(true);
    // Open the tab synchronously on the click so popup blockers allow it; we set
    // its URL once the connect endpoint returns. Linking in a separate tab means
    // Ayrshare's unreliable "Close" button can't strand the user — their Tenfold
    // tab stays put and re-checks connections on refocus.
    const linkTab = window.open("about:blank", "_blank");
    try {
      const res = await api("/api/social/connect", { workspaceSlug });
      const data = (await res.json().catch(() => ({}))) as {
        connectUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.connectUrl)
        throw new Error(data.error ?? "Could not start the connection");
      if (linkTab) linkTab.location.href = data.connectUrl;
      else window.location.href = data.connectUrl; // popup blocked → same tab
    } catch (err) {
      linkTab?.close();
      const msg = (err as Error).message ?? "";
      // Ayrshare returns 403 code 167 when the account isn't on the Business Plan.
      if (/business plan|\b167\b/i.test(msg)) {
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

  // Switch which Facebook Page tenfold publishes to (no re-auth — pages were
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
                  isConnecting={connecting === wizardCurrentPlatformId}
                  onCheckItem={(key, value) =>
                    handleCheckItem(wizardCurrentPlatformId, key, value)
                  }
                  onConnect={() => handleConnect(wizardCurrentPlatformId)}
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
            Follow each platform&apos;s setup checklist, then connect. Tenfold
            publishes to all connected accounts when you publish a campaign.
          </p>
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
            else through Tenfold in one place — a Pro feature.
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

      {/* Connected platforms summary */}
      {!loading && connectedCount > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-success/30 bg-success/5">
          <p className="text-xs font-medium text-success uppercase tracking-wider font-mono mb-3">
            Connected
          </p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.filter((p) => connectedIds.has(p.id)).map((p) => {
              const profile = profiles.find((pr) => pr.platform === p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-success/20"
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
                  <CheckCircle2 className="w-3 h-3 text-success" />
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
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-success/20 pt-3">
            <p className="text-xs text-muted-foreground">
              ✓ You&apos;re ready to publish to your connected{" "}
              {connectedCount === 1 ? "account" : "accounts"}. Create a campaign
              and it&apos;ll be a publish target.
            </p>
            <Button
              size="sm"
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
              connecting={connecting === platform.id}
              onSwitchPage={
                platform.id === "facebook" ? switchFbPage : undefined
              }
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
            Complete the setup checklist for a platform — the connect button
            then appears
          </li>
          <li>
            Click{" "}
            <strong className="text-foreground">Connect [Platform]</strong> — a
            secure window opens
          </li>
          <li>Log in to the platform inside that window, then close it</li>
          <li>
            Tenfold detects the closure and refreshes your connection status
            automatically
          </li>
        </ol>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Connections are managed securely by Tenfold. We never store your
          social passwords.
        </p>
      </div>
    </div>
  );
}
