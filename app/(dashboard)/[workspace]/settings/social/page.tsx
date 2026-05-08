'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ExternalLink, RefreshCw, CheckCircle2, Circle, AlertCircle, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  connected_at: string | null;
}

const PLATFORMS: Array<{
  id: string;
  label: string;
  color: string;
  bg: string;
  description: string;
}> = [
  { id: 'instagram',  label: 'Instagram',   color: '#E1306C', bg: 'bg-[#E1306C]/10', description: 'Photos, Reels & Stories' },
  { id: 'linkedin',   label: 'LinkedIn',    color: '#0A66C2', bg: 'bg-[#0A66C2]/10', description: 'Professional network' },
  { id: 'twitter',    label: 'Twitter / X', color: '#ffffff', bg: 'bg-white/10',      description: 'Posts & threads' },
  { id: 'facebook',   label: 'Facebook',    color: '#1877F2', bg: 'bg-[#1877F2]/10', description: 'Pages & groups' },
  { id: 'youtube',    label: 'YouTube',     color: '#FF0000', bg: 'bg-[#FF0000]/10', description: 'Videos & Shorts' },
  { id: 'tiktok',     label: 'TikTok',      color: '#69C9D0', bg: 'bg-[#69C9D0]/10', description: 'Short-form video' },
  { id: 'pinterest',  label: 'Pinterest',   color: '#E60023', bg: 'bg-[#E60023]/10', description: 'Pins & boards' },
  { id: 'gmb',        label: 'Google Business', color: '#4285F4', bg: 'bg-[#4285F4]/10', description: 'Local business posts' },
];

export default function SocialSettingsPage() {
  const params = useParams();
  const workspaceSlug = params.workspace as string;

  const [profiles, setProfiles]   = useState<SocialProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

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
      const data = await res.json() as SocialProfile[];
      setProfiles(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceSlug]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await api('/api/social/connect', { workspaceSlug });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Could not generate connect URL');
      }
      const { connectUrl } = await res.json() as { connectUrl: string };

      // Open Ayrshare's hosted connection UI in a popup
      const popup = window.open(
        connectUrl,
        'tenfold-social-connect',
        'width=960,height=720,left=200,top=100,resizable=yes,scrollbars=yes',
      );

      // Poll until the user closes the popup, then refresh
      const check = setInterval(() => {
        if (popup?.closed) {
          clearInterval(check);
          setConnecting(false);
          fetchProfiles(true);
        }
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
      setConnecting(false);
    }
  };

  const connectedIds = new Set(profiles.map(p => p.platform));
  const connectedCount = PLATFORMS.filter(p => connectedIds.has(p.id)).length;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">Social Connections</h1>
        <p className="text-muted-foreground text-sm">
          Connect your social accounts once — Tenfold publishes to all of them when you&apos;re ready.
        </p>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Wifi className={`w-4 h-4 ${connectedCount > 0 ? 'text-success' : 'text-muted-foreground'}`} />
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${connectedCount} of ${PLATFORMS.length} platforms connected`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchProfiles(true)}
            disabled={refreshing || loading}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleConnect}
            disabled={connecting || loading}
            className="gap-2 bg-primary hover:bg-primary/90 text-white"
          >
            <ExternalLink className="w-4 h-4" />
            {connecting ? 'Opening…' : connectedCount > 0 ? 'Manage connections' : 'Connect accounts'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Connection error</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Platform grid */}
      <div className="grid grid-cols-2 gap-3">
        {PLATFORMS.map((platform, i) => {
          const profile = profiles.find(p => p.platform === platform.id);
          const connected = !!profile;

          return (
            <motion.div
              key={platform.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 ${
                connected
                  ? 'border-success/30 bg-success/5'
                  : 'border-border bg-card hover:border-border/60'
              }`}
            >
              {/* Platform colour dot */}
              <div className={`w-10 h-10 rounded-xl ${platform.bg} flex items-center justify-center shrink-0`}>
                <span className="text-xs font-bold" style={{ color: platform.color }}>
                  {platform.label.slice(0, 2).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{platform.label}</span>
                  {connected
                    ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    : <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                  }
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{platform.description}</p>
                {connected && (profile.profile_display_name || profile.handle) && (
                  <p className="text-xs text-success mt-1 truncate font-mono">
                    {profile.profile_display_name ?? profile.handle}
                  </p>
                )}
                {connected && !profile.profile_display_name && !profile.handle && (
                  <p className="text-xs text-success mt-1">Connected</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="mt-10 p-5 bg-card border border-border rounded-xl">
        <h2 className="text-sm font-semibold text-foreground mb-3">How connecting works</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Click <strong className="text-foreground">Connect accounts</strong> — a secure window opens</li>
          <li>Log in to each platform you want to publish to</li>
          <li>Close the window when you&apos;re done — Tenfold detects it automatically</li>
          <li>Your connected platforms appear here and are available in the Publish step</li>
        </ol>
        <p className="text-xs text-muted-foreground/60 mt-3">
          Connections are managed securely via Ayrshare. Tenfold never stores your social passwords.
        </p>
      </div>
    </div>
  );
}
