'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Calendar, Clock, CheckCircle2, XCircle, AlertTriangle,
  ExternalLink, X, ChevronRight, Loader2, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
}

interface PlatformMeta {
  label: string;
  color: string;
  bg: string;
  charLimit: number;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  instagram: { label: 'Instagram',       color: '#E1306C', bg: 'bg-[#E1306C]/15', charLimit: 2200  },
  linkedin:  { label: 'LinkedIn',        color: '#0A66C2', bg: 'bg-[#0A66C2]/15', charLimit: 3000  },
  twitter:   { label: 'Twitter / X',     color: '#ffffff', bg: 'bg-white/10',      charLimit: 280   },
  facebook:  { label: 'Facebook',        color: '#1877F2', bg: 'bg-[#1877F2]/15', charLimit: 63206 },
  youtube:   { label: 'YouTube',         color: '#FF0000', bg: 'bg-[#FF0000]/15', charLimit: 5000  },
  tiktok:    { label: 'TikTok',          color: '#69C9D0', bg: 'bg-[#69C9D0]/15', charLimit: 2200  },
  pinterest: { label: 'Pinterest',       color: '#E60023', bg: 'bg-[#E60023]/15', charLimit: 500   },
  gmb:       { label: 'Google Business', color: '#4285F4', bg: 'bg-[#4285F4]/15', charLimit: 1500  },
  threads:   { label: 'Threads',         color: '#ffffff', bg: 'bg-white/10',      charLimit: 500   },
  bluesky:   { label: 'Bluesky',         color: '#0085FF', bg: 'bg-[#0085FF]/15', charLimit: 300   },
};

interface PostResult {
  platform: string;
  status: string;
  id?: string;
  error?: string;
}

// ── Platform checkbox row ─────────────────────────────────────────────────
function PlatformRow({
  profile,
  selected,
  onToggle,
}: {
  profile: SocialProfile;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = PLATFORM_META[profile.platform];
  if (!meta) return null;
  const initials = meta.label.replace(/\s.*/, '').slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-border/70 hover:text-foreground'
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
        <span className="text-[9px] font-bold" style={{ color: meta.color }}>{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-none">{meta.label}</p>
        {(profile.profile_display_name ?? profile.handle) && (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
            {profile.profile_display_name ?? profile.handle}
          </p>
        )}
      </div>
      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
        selected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
      }`}>
        {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function Step5Publish() {
  const {
    generatedAssets, selectedAnchorId, expansions,
    currentCompositionId, workspaceSlug, resetCampaign, setStep,
  } = useAppStore();

  const [profiles, setProfiles]               = useState<SocialProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [caption, setCaption]                 = useState(expansions.script?.content ?? '');
  const [hashtags, setHashtags]               = useState<string[]>([]);
  const [hashtagInput, setHashtagInput]       = useState('');
  const [scheduleMode, setScheduleMode]       = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt]         = useState('');
  const [isPublishing, setIsPublishing]       = useState(false);
  const [results, setResults]                 = useState<PostResult[] | null>(null);

  const confettiParticles = useMemo(() =>
    Array.from({ length: 24 }, () => ({
      // eslint-disable-next-line react-hooks/purity
      x: Math.random() * 100,
      // eslint-disable-next-line react-hooks/purity
      y: Math.random() * 100,
      // eslint-disable-next-line react-hooks/purity
      delay: Math.random() * 0.3,
    })),
  []);

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await api('/api/social/profiles', { workspaceSlug });
      if (res.ok) {
        const data = await res.json() as SocialProfile[];
        setProfiles(data);
        setSelectedPlatforms(data.map(p => p.platform));
      }
    } finally {
      setLoadingProfiles(false);
    }
  }, [workspaceSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const togglePlatform = (id: string) =>
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );

  const addHashtag = (raw: string) => {
    const tag = raw.replace(/^#+/, '').trim().replace(/\s+/g, '_');
    if (!tag || hashtags.includes(tag) || hashtags.length >= 30) return;
    setHashtags(prev => [...prev, tag]);
    setHashtagInput('');
  };

  const handleHashtagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addHashtag(hashtagInput); }
    if (e.key === 'Backspace' && !hashtagInput && hashtags.length > 0)
      setHashtags(prev => prev.slice(0, -1));
  };

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return; }
    if (scheduleMode === 'later' && !scheduledAt) { toast.error('Pick a date and time to schedule'); return; }

    setIsPublishing(true);
    try {
      const body: Record<string, unknown> = {
        compositionId: currentCompositionId,
        platforms: selectedPlatforms,
        caption,
        hashtags,
      };
      if (scheduleMode === 'later') body.scheduledAt = new Date(scheduledAt).toISOString();

      const res = await api('/api/publish', { method: 'POST', body: JSON.stringify(body), workspaceSlug });
      const data = await res.json() as { platform_results?: PostResult[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Publish failed (${res.status})`);

      setResults(
        data.platform_results ??
        selectedPlatforms.map(p => ({ platform: p, status: 'success' })),
      );
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Char limit: tightest of selected platforms ───────────────────────────
  const minLimit = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map(p => PLATFORM_META[p]?.charLimit ?? 2200))
    : 2200;
  const fullText  = caption + (hashtags.length ? '\n\n' + hashtags.map(h => `#${h}`).join(' ') : '');
  const charCount = fullText.length;
  const overLimit = charCount > minLimit;
  const tightPlatform = selectedPlatforms.find(p => (PLATFORM_META[p]?.charLimit ?? 9999) === minLimit);

  // ── Results screen ───────────────────────────────────────────────────────
  if (results) {
    const failures  = results.filter(r => r.status !== 'success' && r.status !== 'sent');
    const allGood   = failures.length === 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full flex flex-col items-center justify-center relative overflow-hidden px-8"
      >
        {allGood && confettiParticles.map((p, i) => (
          <motion.div
            key={i}
            initial={{ x: '50vw', y: '50vh', scale: 0, opacity: 1 }}
            animate={{ x: `${p.x}vw`, y: `${p.y}vw`, scale: [0, 1, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: p.delay }}
            className="absolute w-2 h-2 rounded-sm z-0 pointer-events-none"
            style={{ left: 0, top: 0, backgroundColor: i % 2 === 0 ? '#7C5CFC' : '#ffffff' }}
          />
        ))}

        <div className="relative z-10 text-center max-w-sm w-full">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${allGood ? 'bg-primary/20' : 'bg-amber-500/15'}`}>
            <Send className={`w-9 h-9 translate-x-1 -translate-y-1 ${allGood ? 'text-primary' : 'text-amber-400'}`} />
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground mb-2">
            {allGood ? 'Content published!' : 'Partially published'}
          </h2>
          <p className="text-muted-foreground text-sm mb-8">
            {scheduleMode === 'later' && scheduledAt
              ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}`
              : `Published at ${new Date().toLocaleTimeString()}`}
          </p>

          <div className="space-y-2 mb-8 text-left">
            {results.map(r => {
              const meta = PLATFORM_META[r.platform];
              const ok   = r.status === 'success' || r.status === 'sent';
              return (
                <div key={r.platform} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${ok ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta?.bg ?? 'bg-secondary'}`}>
                    <span className="text-[9px] font-bold" style={{ color: meta?.color ?? 'currentColor' }}>
                      {(meta?.label ?? r.platform).replace(/\s.*/, '').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="flex-1 font-medium text-foreground">{meta?.label ?? r.platform}</span>
                  {ok
                    ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    : <div className="flex items-center gap-1.5 text-destructive shrink-0"><XCircle className="w-4 h-4" /><span className="text-xs">{r.error ?? 'Failed'}</span></div>
                  }
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 border-border" onClick={() => setResults(null)}>
              Edit & republish
            </Button>
            <Button className="flex-1 bg-primary hover:bg-primary/90 text-white" onClick={resetCampaign}>
              New campaign
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── No composition guard ─────────────────────────────────────────────────
  if (!currentCompositionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Composition not saved yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Finish Step 4 to lock in your composition, then come back to publish.
        </p>
        <Button onClick={() => setStep(4)} className="gap-2">
          Back to Compose <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // ── No platforms connected guard ─────────────────────────────────────────
  if (!loadingProfiles && profiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
          <Send className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No social accounts connected</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect your accounts in Settings first — your content will be waiting here when you get back.
        </p>
        <Link href={`/${workspaceSlug}/settings/social`}>
          <Button className="gap-2 bg-primary hover:bg-primary/90 text-white">
            Connect accounts <ExternalLink className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // ── Main publish UI ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">

      {/* Preview panel */}
      <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border shrink-0">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Preview</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto bg-secondary/20">
          <div className="w-full max-w-[300px] bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-3 flex items-center gap-2.5 border-b border-border">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">TF</div>
              <div>
                <p className="text-xs font-semibold text-foreground leading-none">Your brand</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Just now</p>
              </div>
            </div>
            {fullText && (
              <div className="px-3 py-2.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {fullText.slice(0, 140)}{fullText.length > 140 ? '…' : ''}
              </div>
            )}
            {anchor ? (
              <div className="relative w-full aspect-square bg-secondary">
                <Image src={anchor.url} alt="Post media" fill className="object-cover" sizes="100%" />
              </div>
            ) : (
              <div className="w-full aspect-square bg-secondary flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No image</p>
              </div>
            )}
            <div className="p-3 flex gap-3 border-t border-border">
              {[56, 44, 72].map((w, i) => <div key={i} className="h-2.5 bg-secondary rounded-full" style={{ width: w }} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Controls panel */}
      <div className="w-full md:w-[360px] flex flex-col overflow-hidden border-t md:border-t-0 border-border">
        <div className="flex-1 overflow-y-auto divide-y divide-border">

          {/* Platform picker */}
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Platforms</p>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading connected accounts…
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.map(profile => (
                  <PlatformRow
                    key={profile.platform}
                    profile={profile}
                    selected={selectedPlatforms.includes(profile.platform)}
                    onToggle={() => togglePlatform(profile.platform)}
                  />
                ))}
                <Link
                  href={`/${workspaceSlug}/settings/social`}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors pt-1"
                >
                  <ExternalLink className="w-3 h-3" /> Add more platforms in Settings
                </Link>
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Caption</p>
              <span className={`text-[10px] font-mono ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                {charCount.toLocaleString()} / {minLimit.toLocaleString()}
                {tightPlatform && selectedPlatforms.length > 1 && (
                  <span className="ml-1 opacity-60">({PLATFORM_META[tightPlatform]?.label})</span>
                )}
              </span>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write your caption…"
              rows={4}
              className={`w-full bg-secondary/30 border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 resize-none outline-none transition-colors ${
                overLimit ? 'border-destructive/50 focus:border-destructive' : 'border-border focus:border-primary/50'
              }`}
            />
          </div>

          {/* Hashtags */}
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Hashtags</p>
            <div className="min-h-[40px] flex flex-wrap gap-1.5 p-2 bg-secondary/30 border border-border rounded-xl focus-within:border-primary/50 transition-colors">
              {hashtags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                  #{tag}
                  <button type="button" onClick={() => setHashtags(prev => prev.filter(h => h !== tag))} className="hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={hashtagInput}
                onChange={e => setHashtagInput(e.target.value.replace(/[\s,]/g, ''))}
                onKeyDown={handleHashtagKey}
                onBlur={() => { if (hashtagInput) addHashtag(hashtagInput); }}
                placeholder={hashtags.length === 0 ? '#tag — Enter to add' : ''}
                className="flex-1 min-w-[100px] bg-transparent text-sm text-foreground placeholder-muted-foreground/50 outline-none"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{hashtags.length}/30</p>
          </div>

          {/* Schedule */}
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">When to post</p>
            <div className="flex gap-2 mb-3">
              {(['now', 'later'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScheduleMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                    scheduleMode === mode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'now'
                    ? <><Send className="w-3.5 h-3.5" /> Post now</>
                    : <><Calendar className="w-3.5 h-3.5" /> Schedule</>
                  }
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {scheduleMode === 'later' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)} // eslint-disable-line react-hooks/purity
                    onChange={e => setScheduledAt(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Sticky publish button */}
        <div className="p-4 border-t border-border shrink-0">
          {overLimit && tightPlatform && (
            <p className="text-xs text-destructive text-center mb-2">
              Over {minLimit.toLocaleString()}-char limit for {PLATFORM_META[tightPlatform]?.label}. Shorten or deselect it.
            </p>
          )}
          <Button
            onClick={handlePublish}
            disabled={isPublishing || selectedPlatforms.length === 0 || overLimit}
            className="w-full h-12 bg-gradient-to-r from-primary to-[#9D84FD] text-white font-semibold text-base rounded-xl shadow-lg shadow-primary/20 gap-2 disabled:opacity-40"
          >
            {isPublishing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
              : scheduleMode === 'later'
                ? <><Clock className="w-4 h-4" /> Schedule · {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''}</>
                : <><Send className="w-4 h-4" /> Publish · {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
