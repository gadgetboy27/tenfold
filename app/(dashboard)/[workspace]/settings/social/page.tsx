'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, CheckCircle2, Circle, AlertCircle, ArrowUpRight,
  ChevronDown, ChevronUp, ExternalLink, CheckSquare, Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  connected_at: string | null;
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
    id: 'instagram',
    label: 'Instagram',
    color: '#E1306C',
    bg: 'bg-[#E1306C]/10',
    description: 'Photos, Reels & Stories',
    accountType: 'Requires a Business or Creator account (not Personal)',
    steps: [
      { instruction: 'Go to your Instagram profile → Settings → Account → Switch to Professional Account', link: { text: 'Instagram settings', url: 'https://www.instagram.com/accounts/convert_to_business/' } },
      { instruction: 'Choose Creator or Business and follow the on-screen steps' },
      { instruction: 'Link your Instagram to a Facebook Page (required for Business accounts)', link: { text: 'Add a Facebook Page', url: 'https://www.facebook.com/pages/creation/' } },
      { instruction: 'Enable two-factor authentication for account security', link: { text: 'Security settings', url: 'https://www.instagram.com/accounts/two_factor_authentication/app/' } },
    ],
    checklist: [
      { key: 'account_type', label: 'Account switched to Business or Creator', required: true },
      { key: 'facebook_page', label: 'Linked to a Facebook Page', required: true },
      { key: '2fa', label: 'Two-factor authentication enabled', required: false },
      { key: 'username_ready', label: 'Username and password ready to log in', required: true },
    ],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    bg: 'bg-[#0A66C2]/10',
    description: 'Professional network',
    accountType: 'Personal account or Company Page admin',
    steps: [
      { instruction: 'Confirm your LinkedIn personal account is active and in good standing', link: { text: 'LinkedIn account', url: 'https://www.linkedin.com/feed/' } },
      { instruction: 'If posting to a Company Page, confirm you have Admin access', link: { text: 'Manage your page', url: 'https://www.linkedin.com/company/setup/new/' } },
      { instruction: 'Enable two-step verification', link: { text: 'Security settings', url: 'https://www.linkedin.com/psettings/two-step-verification' } },
    ],
    checklist: [
      { key: 'account_active', label: 'LinkedIn account is active', required: true },
      { key: 'page_admin', label: 'Company Page admin access confirmed (if applicable)', required: false },
      { key: 'credentials_ready', label: 'Login credentials ready', required: true },
    ],
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    color: '#ffffff',
    bg: 'bg-white/10',
    description: 'Posts & threads',
    accountType: 'Standard account — phone verification required',
    steps: [
      { instruction: 'Verify your phone number is linked to your X account', link: { text: 'X settings', url: 'https://x.com/settings/phone' } },
      { instruction: 'Enable two-factor authentication', link: { text: '2FA settings', url: 'https://x.com/settings/account/login_verification' } },
      { instruction: 'Ensure your account is not suspended or in a restricted state', link: { text: 'Account status', url: 'https://x.com/settings/account' } },
    ],
    checklist: [
      { key: 'phone_verified', label: 'Phone number verified on X account', required: true },
      { key: 'account_standing', label: 'Account is active and not restricted', required: true },
      { key: '2fa', label: 'Two-factor authentication enabled', required: false },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    bg: 'bg-[#1877F2]/10',
    description: 'Pages & groups',
    accountType: 'Requires a Facebook Page — personal profiles cannot be published to via API',
    steps: [
      { instruction: 'Create a Facebook Page for your business (if you don\'t have one)', link: { text: 'Create a Page', url: 'https://www.facebook.com/pages/creation/' } },
      { instruction: 'Confirm you are an Admin of the Page', link: { text: 'Page settings', url: 'https://www.facebook.com/settings?tab=pages' } },
      { instruction: 'Ensure your personal Facebook account that owns the Page is in good standing' },
    ],
    checklist: [
      { key: 'page_exists', label: 'Facebook Page created for your business', required: true },
      { key: 'page_admin', label: 'You are an Admin of the Page', required: true },
      { key: 'account_standing', label: 'Facebook account in good standing', required: true },
    ],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    bg: 'bg-[#FF0000]/10',
    description: 'Videos & Shorts',
    accountType: 'Google account with a YouTube channel',
    steps: [
      { instruction: 'Sign in to YouTube and create or confirm your channel exists', link: { text: 'YouTube Studio', url: 'https://studio.youtube.com' } },
      { instruction: 'Complete your channel profile (name, description, profile photo)', link: { text: 'Channel customisation', url: 'https://studio.youtube.com/channel/UC/editing/basics' } },
      { instruction: 'Verify your channel via phone to unlock longer video uploads', link: { text: 'Verify channel', url: 'https://www.youtube.com/verify' } },
    ],
    checklist: [
      { key: 'channel_exists', label: 'YouTube channel created', required: true },
      { key: 'channel_verified', label: 'Channel verified via phone', required: true },
      { key: 'profile_complete', label: 'Channel profile filled in', required: false },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#69C9D0',
    bg: 'bg-[#69C9D0]/10',
    description: 'Short-form video',
    accountType: 'TikTok Business or Creator account, account must be 30+ days old',
    steps: [
      { instruction: 'Switch to a Business or Creator account', link: { text: 'Switch account type', url: 'https://www.tiktok.com/business/en-US/blog/how-to-switch-to-business-account' } },
      { instruction: 'Verify your phone number on the account', link: { text: 'TikTok settings', url: 'https://www.tiktok.com/setting' } },
      { instruction: 'Ensure the account is at least 30 days old (TikTok API requirement)' },
      { instruction: 'Complete your profile with a bio and profile photo' },
    ],
    checklist: [
      { key: 'account_type', label: 'Account set to Business or Creator', required: true },
      { key: 'phone_verified', label: 'Phone number verified', required: true },
      { key: 'account_age', label: 'Account is at least 30 days old', required: true },
    ],
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    color: '#E60023',
    bg: 'bg-[#E60023]/10',
    description: 'Pins & boards',
    accountType: 'Pinterest Business account',
    steps: [
      { instruction: 'Convert to or create a Pinterest Business account', link: { text: 'Create Business account', url: 'https://business.pinterest.com' } },
      { instruction: 'Create at least one board to publish pins to', link: { text: 'Pinterest home', url: 'https://www.pinterest.com' } },
      { instruction: 'Optionally claim your website to get attribution on pins', link: { text: 'Claim website', url: 'https://www.pinterest.com/settings/claim' } },
    ],
    checklist: [
      { key: 'business_account', label: 'Pinterest Business account activated', required: true },
      { key: 'board_created', label: 'At least one board created', required: true },
      { key: 'website_claimed', label: 'Website claimed (recommended)', required: false },
    ],
  },
  {
    id: 'gmb',
    label: 'Google Business',
    color: '#4285F4',
    bg: 'bg-[#4285F4]/10',
    description: 'Local business posts',
    accountType: 'Verified Google Business Profile',
    steps: [
      { instruction: 'Create or claim your Google Business Profile', link: { text: 'Google Business', url: 'https://business.google.com' } },
      { instruction: 'Complete the verification process (postcard, phone, or email)', link: { text: 'Verify your business', url: 'https://support.google.com/business/answer/2911778' } },
      { instruction: 'Fill in your business hours, description, and category' },
      { instruction: 'Add your business address and confirm the location is correct' },
    ],
    checklist: [
      { key: 'profile_created', label: 'Google Business Profile created', required: true },
      { key: 'verified', label: 'Business verified with Google', required: true },
      { key: 'profile_complete', label: 'Business hours and description filled in', required: false },
    ],
  },
];

type ChecklistState = Record<string, Record<string, boolean>>;

function loadChecklist(workspaceSlug: string): ChecklistState {
  try {
    const raw = localStorage.getItem(`tenfold_social_checklist_${workspaceSlug}`);
    return raw ? (JSON.parse(raw) as ChecklistState) : {};
  } catch {
    return {};
  }
}

function saveChecklist(workspaceSlug: string, state: ChecklistState) {
  try {
    localStorage.setItem(`tenfold_social_checklist_${workspaceSlug}`, JSON.stringify(state));
  } catch { /* ignore */ }
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
}: {
  platform: PlatformGuide;
  profile: SocialProfile | undefined;
  checklist: Record<string, boolean>;
  expanded: boolean;
  onToggle: () => void;
  onCheckItem: (key: string, value: boolean) => void;
  onConnect: () => void;
  connecting: boolean;
}) {
  const connected = !!profile;
  const requiredItems = platform.checklist.filter(i => i.required);
  const allRequiredChecked = requiredItems.every(i => checklist[i.key]);
  const totalChecked = platform.checklist.filter(i => checklist[i.key]).length;
  const totalItems = platform.checklist.length;
  const readyToConnect = allRequiredChecked && !connected;

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
      connected ? 'border-success/30 bg-success/5' : 'border-border bg-card'
    }`}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl ${platform.bg} flex items-center justify-center shrink-0`}>
          <span className="text-xs font-bold" style={{ color: platform.color }}>
            {platformInitials(platform.label)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{platform.label}</span>
            {connected
              ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              : allRequiredChecked
                ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            }
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {connected
              ? (profile?.profile_display_name ?? profile?.handle ?? 'Connected')
              : platform.description
            }
          </p>
        </div>

        {/* Progress pill */}
        {!connected && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
            allRequiredChecked
              ? 'text-primary border-primary/30 bg-primary/10'
              : 'text-muted-foreground border-border bg-secondary'
          }`}>
            {totalChecked}/{totalItems} ready
          </span>
        )}

        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded guide */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-5">
              {/* Account type requirement */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Account requirement:</strong> {platform.accountType}</p>
              </div>

              {/* Setup steps */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">Setup steps</p>
                <ol className="space-y-2">
                  {platform.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="text-primary font-bold shrink-0 w-4">{i + 1}.</span>
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mb-2">Your checklist</p>
                <div className="space-y-2">
                  {platform.checklist.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onCheckItem(item.key, !checklist[item.key])}
                      className="w-full flex items-start gap-3 text-left group"
                    >
                      {checklist[item.key]
                        ? <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        : <Square className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
                      }
                      <span className={`text-sm leading-relaxed ${checklist[item.key] ? 'text-foreground line-through opacity-60' : 'text-muted-foreground'}`}>
                        {item.label}
                        {item.required && !checklist[item.key] && (
                          <span className="ml-1 text-[10px] text-destructive font-medium">required</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connect / connected state */}
              {connected ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20">
                  <div>
                    <p className="text-sm font-medium text-success">Connected</p>
                    {(profile?.profile_display_name ?? profile?.handle) && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {profile?.profile_display_name ?? profile?.handle}
                      </p>
                    )}
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
              ) : readyToConnect ? (
                <Button
                  onClick={onConnect}
                  disabled={connecting}
                  className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {connecting ? 'Opening…' : `Connect ${platform.label}`}
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
                  <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Complete all <strong className="text-foreground">required</strong> checklist items above to unlock the connect button
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

export default function SocialSettingsPage() {
  const params = useParams();
  const workspaceSlug = params.workspace as string;

  const [profiles, setProfiles]     = useState<SocialProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [checklist, setChecklist]   = useState<ChecklistState>({});

  // Load checklist from localStorage once workspaceSlug is available
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (workspaceSlug) setChecklist(loadChecklist(workspaceSlug));
  }, [workspaceSlug]);

  const fetchProfiles = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await api('/api/social/profiles', { workspaceSlug });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Failed to load (${res.status})`);
      }
      setProfiles(await res.json() as SocialProfile[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    setError(null);
    try {
      const res = await api('/api/social/connect', { workspaceSlug });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        const msg = body.error ?? '';
        if (msg.includes('business plan') || msg.includes('167')) {
          setNeedsUpgrade(true);
          setConnecting(null);
          return;
        }
        throw new Error(msg || `Could not generate connect URL (${res.status})`);
      }
      const { connectUrl } = await res.json() as { connectUrl: string };
      const popup = window.open(connectUrl, 'tenfold-social-connect', 'width=960,height=720,left=200,top=100,resizable=yes,scrollbars=yes');
      const check = setInterval(() => {
        if (popup?.closed) {
          clearInterval(check);
          setConnecting(null);
          fetchProfiles(true);
        }
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
      setConnecting(null);
    }
  };

  const handleCheckItem = (platformId: string, itemKey: string, value: boolean) => {
    setChecklist(prev => {
      const next = { ...prev, [platformId]: { ...(prev[platformId] ?? {}), [itemKey]: value } };
      saveChecklist(workspaceSlug, next);
      return next;
    });
  };

  const connectedIds = new Set(profiles.map(p => p.platform));
  const connectedCount = PLATFORMS.filter(p => connectedIds.has(p.id)).length;
  const progressPct = Math.round((connectedCount / PLATFORMS.length) * 100);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">Social Connections</h1>
        <p className="text-muted-foreground text-sm">
          Follow each platform&apos;s setup checklist, then connect. Tenfold publishes to all connected accounts when you publish a campaign.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            {loading ? 'Loading…' : `${connectedCount} of ${PLATFORMS.length} platforms connected`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchProfiles(true)}
            disabled={refreshing || loading}
            className="gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, background: connectedCount === PLATFORMS.length ? 'var(--color-success)' : 'var(--color-primary)' }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Connection error</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Ayrshare upgrade notice */}
      {needsUpgrade && (
        <div className="mb-4 p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">Ayrshare Business Plan required</p>
              <p className="text-sm text-muted-foreground mb-3">The in-app connection popup requires Ayrshare&apos;s Business Plan. You have two options:</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold mt-0.5">1.</span>
                  <span>
                    <strong className="text-foreground">Upgrade Ayrshare</strong> — unlocks the in-app connection flow.{' '}
                    <a href="https://www.ayrshare.com/business-plan-for-multiple-users/" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-1">
                      View pricing <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold mt-0.5">2.</span>
                  <span>
                    <strong className="text-foreground">Connect via Ayrshare dashboard</strong> directly, then hit Refresh above.{' '}
                    <a href="https://app.ayrshare.com" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-1">
                      Open Ayrshare <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </span>
                </div>
              </div>
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
              profile={profiles.find(p => p.platform === platform.id)}
              checklist={checklist[platform.id] ?? {}}
              expanded={expanded === platform.id}
              onToggle={() => setExpanded(prev => prev === platform.id ? null : platform.id)}
              onCheckItem={(key, value) => handleCheckItem(platform.id, key, value)}
              onConnect={() => handleConnect(platform.id)}
              connecting={connecting === platform.id}
            />
          </motion.div>
        ))}
      </div>

      {/* How it works */}
      <div className="mt-8 p-5 bg-card border border-border rounded-xl">
        <h2 className="text-sm font-semibold text-foreground mb-3">How connecting works</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Complete the setup checklist for a platform — the connect button then appears</li>
          <li>Click <strong className="text-foreground">Connect [Platform]</strong> — a secure window opens via Ayrshare</li>
          <li>Log in to the platform inside that window, then close it</li>
          <li>Tenfold detects the closure and refreshes your connection status automatically</li>
        </ol>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Connections are managed securely via Ayrshare. Tenfold never stores your social passwords.
        </p>
      </div>
    </div>
  );
}
