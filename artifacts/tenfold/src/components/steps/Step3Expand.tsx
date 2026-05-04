import React, { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, LayoutGrid } from 'lucide-react';
import FormatCard from '../shared/FormatCard';
import AnchorGuide from '../shared/AnchorGuide';
import toast from 'react-hot-toast';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

async function createJob(params: {
  type: string;
  campaignId: string;
  anchorAssetId?: string;
  duration?: number;
  mood?: string;
  platform?: string;
  tone?: string;
}) {
  const res = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Job creation failed (${res.status})`);
  }
  return res.json() as Promise<{ jobId: string; status: string; creditCost: number }>;
}

async function pollJob(jobId: string, onReady: (job: any) => void, onError: (msg: string) => void) {
  const MAX_ATTEMPTS = 40;
  let attempts = 0;

  const tick = async () => {
    if (attempts >= MAX_ATTEMPTS) {
      onError('Job timed out — please try again');
      return;
    }
    attempts++;
    try {
      const res = await fetch(`${BASE}/api/jobs/${jobId}`);
      if (!res.ok) { onError('Failed to check job status'); return; }
      const job = await res.json();
      if (job.status === 'ready') { onReady(job); return; }
      if (job.status === 'failed') { onError('Generation failed'); return; }
      setTimeout(tick, 1500);
    } catch {
      onError('Network error while checking job');
    }
  };

  setTimeout(tick, 1000);
}

export default function Step3Expand() {
  const [showGuide, setShowGuide] = useState(true);
  const { generatedAssets, selectedAnchorId, updateExpansion, setCreditBalance, creditBalance, currentCampaignId } = useAppStore();
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const handleGenerate = async (
    type: 'video' | 'music' | 'script' | 'variations',
    opts: { duration?: number; mood?: string; platform?: string; tone?: string } = {}
  ) => {
    if (!anchor) return;

    updateExpansion(type, {
      id: 'pending',
      status: 'generating',
      type,
      createdAt: new Date().toISOString(),
    });

    try {
      const { jobId, creditCost } = await createJob({
        type: type === 'variations' ? 'image_variation' : type,
        campaignId: currentCampaignId ?? 'demo',
        anchorAssetId: anchor.id,
        ...opts,
      });

      setCreditBalance(creditBalance - creditCost);

      pollJob(
        jobId,
        (job) => {
          updateExpansion(type, {
            id: job.id,
            status: 'ready',
            type,
            createdAt: job.createdAt,
            url: job.outputUrl ?? undefined,
            content: job.outputText ?? undefined,
          });
          toast.success(`${type} ready`);
        },
        (msg) => {
          updateExpansion(type, {
            id: 'error',
            status: 'failed',
            type,
            createdAt: new Date().toISOString(),
          });
          toast.error(msg);
        }
      );
    } catch (err: any) {
      updateExpansion(type, { id: 'error', status: 'failed', type, createdAt: new Date().toISOString() });
      toast.error(err.message ?? 'Generation failed');
    }
  };

  if (!anchor) return null;

  return (
    <div className="h-full flex gap-8 relative">
      {showGuide && <AnchorGuide onDismiss={() => setShowGuide(false)} />}

      {/* Anchor sidebar */}
      <div className="w-72 shrink-0 space-y-4">
        <h2 className="font-serif text-xl font-bold text-foreground">Your anchor</h2>
        <div className="aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
          <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
        </div>
        <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
          "{anchor.prompt.substring(0, 80)}{anchor.prompt.length > 80 ? '...' : ''}"
        </p>
      </div>

      {/* Format cards */}
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-4 auto-rows-fr">
          <FormatCard
            type="video"
            title="Video"
            subtitle="10 to 60 second cinematic clip"
            cost="15–80 cr"
            icon={Film}
            onGenerate={() => handleGenerate('video', { duration: 10 })}
          >
            <div className="flex gap-2">
              {['10s', '30s', '60s'].map(t => (
                <button
                  key={t}
                  className="flex-1 py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard
            type="music"
            title="Music"
            subtitle="30s background track"
            cost="8 cr"
            icon={Music}
            onGenerate={() => handleGenerate('music', { mood: 'Uplifting' })}
          >
            <div className="grid grid-cols-2 gap-2">
              {['Uplifting', 'Corporate', 'Dramatic', 'Chill'].map(m => (
                <button
                  key={m}
                  className="py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors"
                >
                  {m}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard
            type="script"
            title="Script"
            subtitle="Caption or voiceover"
            cost="1 cr"
            icon={FileText}
            onGenerate={() => handleGenerate('script', { platform: 'IG', tone: 'Pro' })}
          >
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[10px] text-muted-foreground uppercase w-12 pt-1">Platform</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {['IG', 'LI', 'TikTok'].map(p => (
                    <button key={p} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] text-muted-foreground uppercase w-12 pt-1">Tone</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {['Pro', 'Casual', 'Playful'].map(t => (
                    <button key={t} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FormatCard>

          <FormatCard
            type="variations"
            title="More Images"
            subtitle="Variations of your anchor"
            cost="3 cr/ea"
            icon={LayoutGrid}
            onGenerate={() => handleGenerate('variations')}
          >
            <div className="text-sm text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg">
              Generate 4 new variations
            </div>
          </FormatCard>
        </div>
      </div>
    </div>
  );
}
