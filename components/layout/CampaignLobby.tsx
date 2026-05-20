'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useAppStore, type CampaignResume, type Asset } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Sparkles, Clock, ChevronRight, Loader2,
  Image as ImageIcon, Trash2, AlertTriangle, XCircle, Pen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

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
  generatingSince: string | null;
}

const STEP_LABELS = ['', 'Create', 'Select', 'Expand', 'Compose', 'Publish'];
const STATUS_COLORS: Record<string, string> = {
  ready:      'text-success bg-success/10 border-success/20',
  expanding:  'text-primary bg-primary/10 border-primary/20',
  generating: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  failed:     'text-destructive bg-destructive/10 border-destructive/20',
};

function CampaignProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 mt-1.5" title={`Step ${currentStep} of 5`}>
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className={cn(
            'h-1 rounded-full transition-all',
            s < currentStep  ? 'bg-primary flex-1' :
            s === currentStep ? 'bg-primary/50 flex-1' :
            'bg-border flex-1',
          )}
        />
      ))}
      <span className="text-[10px] text-muted-foreground font-mono ml-1 shrink-0">{currentStep}/5</span>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Confirmation modal ───────────────────────────────────────────────────────
function DeleteConfirmModal({
  campaign,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  campaign: CampaignRow;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Red warning strip */}
          <div className="h-1.5 bg-gradient-to-r from-destructive to-red-400" />

          <div className="p-6">
            {/* Icon + heading */}
            <div className="flex items-start gap-4 mb-5">
              <div className="w-11 h-11 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Delete this campaign?</h2>
                <p className="text-sm text-muted-foreground mt-0.5">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            {/* Campaign name chip */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20 mb-5">
              {campaign.thumbnailUrl ? (
                <Image src={campaign.thumbnailUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{campaign.name}</p>
                <p className="text-xs text-muted-foreground truncate italic">
                  &ldquo;{campaign.prompt.slice(0, 60)}{campaign.prompt.length > 60 ? '…' : ''}&rdquo;
                </p>
              </div>
            </div>

            {/* What gets deleted */}
            <ul className="space-y-1.5 mb-6">
              {[
                'All generated images, videos, and music',
                'Campaign progress and settings',
                'Compositions and publish history',
              ].map(item => (
                <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-1 h-1 rounded-full bg-destructive/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={onCancel}
                disabled={isDeleting}
              >
                Keep campaign
              </Button>
              <Button
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white gap-2"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                  : <><Trash2 className="w-4 h-4" /> Delete permanently</>
                }
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main lobby ───────────────────────────────────────────────────────────────
export default function CampaignLobby() {
  const { workspaceSlug, loadCampaign } = useAppStore();
  const [campaigns, setCampaigns]         = useState<CampaignRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [resuming, setResuming]           = useState<string | null>(null);
  const [cancelling, setCancelling]       = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CampaignRow | null>(null);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [renaming, setRenaming]           = useState<{ id: string; value: string } | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/campaigns', { workspaceSlug });
      if (res.ok) setCampaigns(await res.json() as CampaignRow[]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleNew = () => {
    useAppStore.getState().resetCampaign();
    useAppStore.getState().setCampaignId('__new__');
  };

  const handleRenameStart = (e: React.MouseEvent, c: CampaignRow) => {
    e.stopPropagation();
    setRenaming({ id: c.id, value: c.name });
  };

  const handleRenameSave = async () => {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    const id = renaming.id;
    setRenaming(null);
    if (!trimmed) return;
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
    await api(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: trimmed }),
      workspaceSlug,
    }).catch(() => {});
  };

  const handleCancel = async (c: CampaignRow) => {
    setCancelling(c.id);
    try {
      const res = await api(`/api/campaigns/${c.id}/cancel`, { method: 'POST', workspaceSlug });
      if (res.ok) {
        const result = await res.json() as { status: string; creditsRefunded: number };
        setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: result.status } : x));
        toast.success(
          result.creditsRefunded > 0
            ? `Generation cancelled — ${result.creditsRefunded} credits refunded`
            : 'Generation cancelled',
        );
      }
    } catch {
      toast.error('Failed to cancel generation');
    } finally {
      setCancelling(null);
    }
  };

  const handleResume = async (c: CampaignRow) => {
    setResuming(c.id);
    try {
      const res = await api(`/api/campaigns/${c.id}`, { workspaceSlug });
      if (!res.ok) return;
      const full = await res.json() as {
        id: string; name: string; current_step: number;
        anchor_asset_id: string | null;
        expansion_data: Record<string, unknown>;
        assets: Array<{ id: string; url: string; type: string; created_at: string }>;
        parameters?: { aspectRatio?: string; style?: string };
        prompt: string;
        latestCompositionId?: string | null;
      };

      const imageAssets: Asset[] = (full.assets ?? [])
        .filter(a => a.type === 'image')
        .map(a => ({
          id: a.id, url: a.url,
          prompt: full.prompt,
          aspectRatio: full.parameters?.aspectRatio ?? '1:1',
          style: full.parameters?.style ?? 'Photorealistic',
          createdAt: a.created_at,
        }));

      // Rebuild expansion data from saved DB record + any assets not yet reflected there
      const expansionData = { ...(full.expansion_data ?? {}) } as CampaignResume['expansion_data'];

      const videoAsset = (full.assets ?? []).find(a => a.type === 'video');
      if (videoAsset && !expansionData.video?.url) {
        expansionData.video = { status: 'ready', url: videoAsset.url };
      }
      const audioAsset = (full.assets ?? []).find(a => a.type === 'audio');
      if (audioAsset && !expansionData.music?.url) {
        expansionData.music = { status: 'ready', url: audioAsset.url };
      }

      // Infer anchor from first image asset when it was never saved to DB
      // (campaigns created before anchor_asset_id persistence was added)
      let anchorAssetId = full.anchor_asset_id;
      const storedStep = full.current_step ?? c.current_step;
      if (!anchorAssetId && imageAssets.length > 0) {
        anchorAssetId = imageAssets[0].id;
        // Back-fill so future loads don't need to infer; also advance step to 2 minimum
        api(`/api/campaigns/${full.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            anchor_asset_id: anchorAssetId,
            current_step: Math.max(storedStep, 2),
          }),
          workspaceSlug,
        }).catch(() => {});
      }

      // Advance step if stored value is lower than what the data implies
      // (e.g. default step=1 on old campaigns that clearly have images)
      const inferredStep = (() => {
        if (storedStep >= 3) return storedStep;
        if (anchorAssetId) return Math.max(storedStep, 3);
        if (imageAssets.length > 0) return Math.max(storedStep, 2);
        return storedStep;
      })();

      loadCampaign({
        id: full.id,
        name: full.name ?? c.name,
        current_step: inferredStep,
        anchor_asset_id: anchorAssetId,
        expansion_data: expansionData,
        imageAssets,
        compositionId: full.latestCompositionId ?? null,
      });
    } finally {
      setResuming(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      const res = await api(`/api/campaigns/${confirmDelete.id}`, {
        method: 'DELETE',
        workspaceSlug,
      });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== confirmDelete.id));
        setConfirmDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <>
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <DeleteConfirmModal
          campaign={confirmDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => !isDeleting && setConfirmDelete(null)}
          isDeleting={isDeleting}
        />
      )}

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
              <p className="text-sm text-muted-foreground mt-0.5">Generate images from a prompt or analyze your website to build a brief</p>
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-4">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
              </p>
              {campaigns.map((c, i) => {
                const isGenerating  = c.status === 'generating';
                const isLoading     = resuming === c.id;
                const isCancelling  = cancelling === c.id;
                const stepLabel     = STEP_LABELS[c.current_step] ?? 'Create';
                const statusColor   = STATUS_COLORS[c.status] ?? STATUS_COLORS.expanding;

                // How long has it been generating?
                const generatingMs = c.generatingSince
                  ? now - new Date(c.generatingSince).getTime()
                  : 0;
                const generatingSecs = Math.floor(generatingMs / 1000);
                const isStuck = isGenerating && generatingMs > 3 * 60 * 1000; // > 3 min

                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className="group flex items-center gap-4 p-4 rounded-xl border bg-card transition-all border-border hover:border-primary/30 hover:bg-card/80"
                  >
                    {/* Thumbnail — always clickable */}
                    <div
                      className="relative w-14 h-14 rounded-lg overflow-hidden bg-secondary border border-border shrink-0 flex items-center justify-center cursor-pointer"
                      onClick={() => !isLoading && handleResume(c)}
                    >
                      {c.thumbnailUrl ? (
                        <Image src={c.thumbnailUrl} alt="" fill className="object-cover" sizes="56px" />
                      ) : isGenerating ? (
                        <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Name + prompt */}
                    <div className="flex-1 min-w-0">
                      {renaming?.id === c.id ? (
                        <input
                          autoFocus
                          value={renaming.value}
                          onChange={e => setRenaming({ ...renaming, value: e.target.value })}
                          onBlur={handleRenameSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSave();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          className="text-sm font-semibold bg-secondary border border-primary/50 rounded-md px-2 py-0.5 text-foreground outline-none w-full"
                        />
                      ) : (
                        <div
                          className="flex items-center gap-1.5 group/name cursor-pointer"
                          onClick={() => !isLoading && handleResume(c)}
                        >
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{c.name}</p>
                          <button
                            type="button"
                            onClick={e => handleRenameStart(e, c)}
                            className="opacity-0 group-hover/name:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                            title="Rename campaign"
                          >
                            <Pen className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                      <p
                        className="text-xs text-muted-foreground truncate mt-0.5 italic cursor-pointer"
                        onClick={() => !isLoading && handleResume(c)}
                      >
                        &ldquo;{c.prompt.slice(0, 70)}{c.prompt.length > 70 ? '…' : ''}&rdquo;
                      </p>
                      {!isGenerating && <CampaignProgress currentStep={c.current_step} />}
                      {isGenerating && generatingSecs > 0 && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          {isStuck ? '⚠ Generation may be stuck' : `Generating for ${generatingSecs}s…`}
                        </p>
                      )}
                    </div>

                    {/* Step / status badge */}
                    <div className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${statusColor}`}>
                      {isGenerating ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Generating
                        </span>
                      ) : `Step ${c.current_step} · ${stepLabel}`}
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />
                      {timeAgo(c.created_at)}
                    </div>

                    {/* Cancel button — shown for generating campaigns */}
                    {isGenerating && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleCancel(c); }}
                        disabled={isCancelling}
                        className={cn(
                          'shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors',
                          isStuck
                            ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                            : 'opacity-0 group-hover:opacity-100 border-border text-muted-foreground hover:text-destructive hover:border-destructive/40',
                        )}
                        title="Cancel generation and refund credits"
                      >
                        {isCancelling
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <XCircle className="w-3 h-3" />
                        }
                        {isStuck ? 'Cancel' : ''}
                      </button>
                    )}

                    {/* Resume arrow / loading */}
                    {isLoading
                      ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                      : (
                        <button
                          type="button"
                          onClick={() => handleResume(c)}
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title="Open campaign"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )
                    }

                    {/* Delete button — visible on hover */}
                    {!isLoading && !isCancelling && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setConfirmDelete(c); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                        title="Delete campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
