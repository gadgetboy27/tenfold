import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, Presentation, PenTool } from 'lucide-react';
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
  count?: number;
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
    if (attempts >= MAX_ATTEMPTS) { onError('Job timed out'); return; }
    attempts++;
    try {
      const res = await fetch(`${BASE}/api/jobs/${jobId}`);
      if (!res.ok) { onError('Failed to check job status'); return; }
      const job = await res.json();
      if (job.status === 'ready') { onReady(job); return; }
      if (job.status === 'failed') { onError('Generation failed'); return; }
      setTimeout(tick, 1500);
    } catch { onError('Network error'); }
  };
  setTimeout(tick, 1000);
}

type ExpandType = 'video' | 'music' | 'script' | 'slides' | 'logo';

export default function Step3Expand() {
  const [showGuide, setShowGuide] = useState(true);
  const { generatedAssets, selectedAnchorId, updateExpansion, setCreditBalance, creditBalance, currentCampaignId } = useAppStore();
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const handleGenerate = async (type: ExpandType, opts: Record<string, any> = {}) => {
    if (!anchor) return;

    updateExpansion(type, { id: 'pending', status: 'generating', type, createdAt: new Date().toISOString() });

    try {
      const apiType = type === 'slides' ? 'slide_deck' : type === 'logo' ? 'logo' : type === 'variations' ? 'image_variation' : type;
      const { jobId, creditCost } = await createJob({
        type: apiType,
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
            urls: job.outputUrls ?? undefined,
            content: job.outputText ?? undefined,
          });
          toast.success(`${title(type)} ready`);
        },
        (msg) => {
          updateExpansion(type, { id: 'error', status: 'failed', type, createdAt: new Date().toISOString() });
          toast.error(msg);
        }
      );
    } catch (err: any) {
      updateExpansion(type, { id: 'error', status: 'failed', type, createdAt: new Date().toISOString() });
      toast.error(err.message ?? 'Generation failed');
    }
  };

  const title = (t: ExpandType) => ({ video: 'Video', music: 'Music', script: 'Script', slides: 'Slide deck', logo: 'Logo' }[t]);

  if (!anchor) return null;

  return (
    <div className="h-full flex gap-8 relative">
      {showGuide && <AnchorGuide onDismiss={() => setShowGuide(false)} />}

      {/* Anchor sidebar */}
      <div className="w-64 shrink-0 space-y-4">
        <h2 className="font-serif text-xl font-bold text-foreground">Your anchor</h2>
        <div className="aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
          <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
        </div>
        <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
          "{anchor.prompt.substring(0, 80)}{anchor.prompt.length > 80 ? '...' : ''}"
        </p>
      </div>

      {/* Format cards — 3 cols top row, 2 cols bottom row */}
      <div className="flex-1 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <FormatCard type="video" title="Video" subtitle="10–60s cinematic clip" cost="15–80 cr" icon={Film}
            onGenerate={() => handleGenerate('video', { duration: 10 })}>
            <div className="flex gap-2">
              {['10s', '30s', '60s'].map(t => (
                <button key={t} className="flex-1 py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors">{t}</button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="music" title="Music" subtitle="30s background track" cost="8 cr" icon={Music}
            onGenerate={() => handleGenerate('music', { mood: 'Uplifting' })}>
            <div className="grid grid-cols-2 gap-1.5">
              {['Uplifting', 'Corporate', 'Dramatic', 'Chill'].map(m => (
                <button key={m} className="py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors">{m}</button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="script" title="Caption" subtitle="Platform-ready caption or voiceover" cost="1 cr" icon={FileText}
            onGenerate={() => handleGenerate('script', { platform: 'IG', tone: 'Pro' })}>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Platform</span>
                <div className="flex gap-1 flex-wrap flex-1">
                  {['IG', 'LI', 'TikTok'].map(p => (
                    <button key={p} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">{p}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Tone</span>
                <div className="flex gap-1 flex-wrap flex-1">
                  {['Pro', 'Casual', 'Playful'].map(t => (
                    <button key={t} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">{t}</button>
                  ))}
                </div>
              </div>
            </div>
          </FormatCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormatCard type="slides" title="Slide Deck" subtitle="Sequence of presentation-ready static images" cost="12 cr" icon={Presentation}
            onGenerate={() => handleGenerate('slides', { count: 6 })}>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Slides</span>
                <div className="flex gap-1">
                  {['4', '6', '8', '12'].map(n => (
                    <button key={n} className="px-2.5 py-1 text-[10px] rounded-full border border-border bg-background hover:border-primary/50">{n}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Format</span>
                <div className="flex gap-1">
                  {['16:9', '4:3', '1:1'].map(f => (
                    <button key={f} className="px-2.5 py-1 text-[10px] rounded-full border border-border bg-background hover:border-primary/50">{f}</button>
                  ))}
                </div>
              </div>
            </div>
          </FormatCard>

          <FormatCard type="logo" title="Logo Design" subtitle="Brand logo concepts in multiple styles" cost="6 cr" icon={PenTool}
            onGenerate={() => handleGenerate('logo')}>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Style</span>
                <div className="flex gap-1 flex-wrap flex-1">
                  {['Minimal', 'Bold', 'Geometric', 'Script'].map(s => (
                    <button key={s} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Icon</span>
                <div className="flex gap-1">
                  {['With', 'Without', 'Only'].map(i => (
                    <button key={i} className="px-2 py-1 text-[10px] rounded border border-border bg-background hover:border-primary/50">{i}</button>
                  ))}
                </div>
              </div>
            </div>
          </FormatCard>
        </div>
      </div>
    </div>
  );
}
