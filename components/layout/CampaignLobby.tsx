'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore, type CampaignResume, type Asset } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';
import { Plus, Sparkles, Clock, ChevronRight, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CampaignRow {
  id: string;
  name: string;
  prompt: string;
  status: string;
  current_step: number;
  anchor_asset_id: string | null;
  expansion_data: Record<string, unknown>;
  thumbnailUrl: string | null;
  created_at: string;
}

const STEP_LABELS = ['', 'Create', 'Select', 'Expand', 'Compose', 'Publish'];
const STATUS_COLORS: Record<string, string> = {
  ready: 'text-success bg-success/10 border-success/20',
  expanding: 'text-primary bg-primary/10 border-primary/20',
  generating: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  failed: 'text-destructive bg-destructive/10 border-destructive/20',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CampaignLobby() {
  const { workspaceSlug, loadCampaign } = useAppStore();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [resuming, setResuming]   = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/campaigns', { workspaceSlug });
      if (res.ok) setCampaigns(await res.json() as CampaignRow[]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleNew = () => {
    // resetCampaign already called by DashboardClient — store is clean, lobby hides itself
    // because currentCampaignId is null and we just set a sentinel to enter workflow
    useAppStore.getState().resetCampaign();
    // Set a non-null campaignId sentinel so DashboardClient shows the workflow (step 1)
    useAppStore.getState().setCampaignId('__new__');
  };

  const handleResume = async (c: CampaignRow) => {
    if (c.status === 'generating') return; // not resumable until complete
    setResuming(c.id);
    try {
      // Fetch full campaign including image assets
      const res = await api(`/api/campaigns/${c.id}`, { workspaceSlug });
      if (!res.ok) return;
      const full = await res.json() as {
        id: string; name: string; current_step: number;
        anchor_asset_id: string | null;
        expansion_data: Record<string, unknown>;
        assets: Array<{ id: string; url: string; type: string; created_at: string }>;
        parameters?: { aspectRatio?: string; style?: string };
        prompt: string;
      };

      const imageAssets: Asset[] = (full.assets ?? [])
        .filter(a => a.type === 'image')
        .map(a => ({
          id: a.id,
          url: a.url,
          prompt: full.prompt,
          aspectRatio: full.parameters?.aspectRatio ?? '1:1',
          style: full.parameters?.style ?? 'Photorealistic',
          createdAt: a.created_at,
        }));

      const resume: CampaignResume = {
        id: full.id,
        name: full.name ?? c.name,
        current_step: full.current_step ?? c.current_step,
        anchor_asset_id: full.anchor_asset_id,
        expansion_data: (full.expansion_data ?? {}) as CampaignResume['expansion_data'],
        imageAssets,
      };
      loadCampaign(resume);
    } finally {
      setResuming(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Campaigns</h1>
          <p className="text-muted-foreground text-sm">Pick up where you left off, or start something new.</p>
        </div>

        {/* New campaign CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleNew}
          className="w-full mb-8 flex items-center gap-5 p-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors shrink-0">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-foreground">Start new campaign</p>
            <p className="text-sm text-muted-foreground mt-0.5">Generate 4 images from a prompt, then build video, music and social posts</p>
          </div>
          <ChevronRight className="w-5 h-5 text-primary ml-auto opacity-60 group-hover:opacity-100 transition-opacity" />
        </motion.button>

        {/* Campaign list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading campaigns…</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No campaigns yet — hit the button above to create your first one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-4">Recent campaigns</p>
            {campaigns.map((c, i) => {
              const isGenerating = c.status === 'generating';
              const isLoading    = resuming === c.id;
              const stepLabel    = STEP_LABELS[c.current_step] ?? 'Create';
              const statusColor  = STATUS_COLORS[c.status] ?? STATUS_COLORS.expanding;

              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => !isGenerating && !isLoading && handleResume(c)}
                  className={`flex items-center gap-4 p-4 rounded-xl border bg-card transition-all ${
                    isGenerating
                      ? 'border-border opacity-60 cursor-not-allowed'
                      : 'border-border hover:border-primary/30 hover:bg-card/80 cursor-pointer group'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary border border-border shrink-0 flex items-center justify-center">
                    {c.thumbnailUrl ? (
                      <img src={c.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : isGenerating ? (
                      <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Name + prompt */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 italic">
                      &ldquo;{c.prompt.slice(0, 70)}{c.prompt.length > 70 ? '…' : ''}&rdquo;
                    </p>
                  </div>

                  {/* Step badge */}
                  <div className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${statusColor}`}>
                    {isGenerating ? 'Generating…' : `Step ${c.current_step} · ${stepLabel}`}
                  </div>

                  {/* Time */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3 h-3" />
                    {timeAgo(c.created_at)}
                  </div>

                  {/* Resume arrow */}
                  {!isGenerating && (
                    isLoading
                      ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
