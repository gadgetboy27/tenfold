import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText } from 'lucide-react';
import FormatCard from '../shared/FormatCard';
import AnchorGuide from '../shared/AnchorGuide';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

async function getAuthHeaders(): Promise<{ token?: string; workspaceSlug?: string }> {
  const token = supabase
    ? (await supabase.auth.getSession()).data.session?.access_token
    : undefined;
  const workspaceSlug = useAppStore.getState().workspaceSlug;
  return { token: token ?? undefined, workspaceSlug };
}

async function createJob(type: string, campaignId: string, params: Record<string, unknown>) {
  const auth = await getAuthHeaders();
  const res = await api('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ type, campaignId, params }),
    ...auth,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Job creation failed (${res.status})`);
  }
  return res.json() as Promise<{ jobId: string; status: string; creditCost: number; result?: string }>;
}

async function pollJob(
  jobId: string,
  onReady: (job: Record<string, unknown>) => void,
  onError: (msg: string) => void,
) {
  const MAX_ATTEMPTS = 40;
  let attempts = 0;
  const auth = await getAuthHeaders();

  const tick = async () => {
    if (attempts >= MAX_ATTEMPTS) { onError('Job timed out'); return; }
    attempts++;
    try {
      const res = await api(`/api/jobs/${jobId}`, auth);
      if (!res.ok) { onError('Failed to check job status'); return; }
      const job = await res.json() as Record<string, unknown>;
      if (job.status === 'ready') { onReady(job); return; }
      if (job.status === 'failed') { onError('Generation failed'); return; }
      setTimeout(tick, 1500);
    } catch {
      onError('Network error');
    }
  };
  setTimeout(tick, 1000);
}

type ExpandType = 'video' | 'music' | 'script';
const TITLES: Record<ExpandType, string> = { video: 'Video', music: 'Music', script: 'Caption' };

export default function Step3Expand() {
  const [showGuide, setShowGuide] = useState(true);
  const [videoDuration, setVideoDuration] = useState<10 | 30 | 60>(10);
  const [videoMood, setVideoMood] = useState('Uplifting');
  const [scriptPlatform, setScriptPlatform] = useState('instagram');
  const [scriptTone, setScriptTone] = useState('professional');
  const { generatedAssets, selectedAnchorId, updateExpansion, setCreditBalance, creditBalance, currentCampaignId } = useAppStore();
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const syncBalance = async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await api('/api/credits/balance', auth);
      if (res.ok) {
        const data = await res.json() as { balance: number };
        if (typeof data.balance === 'number') setCreditBalance(data.balance);
      }
    } catch { /* non-critical */ }
  };

  const handleGenerate = async (type: ExpandType) => {
    if (!anchor) return;
    updateExpansion(type, { id: 'pending', status: 'generating', type, createdAt: new Date().toISOString() });

    try {
      const campaignId = currentCampaignId ?? 'demo';

      // Script returns synchronously — no polling needed
      if (type === 'script') {
        const PLATFORM_MAP: Record<string, string> = { IG: 'instagram', LI: 'linkedin', TikTok: 'tiktok' };
        const TONE_MAP: Record<string, string> = { Pro: 'professional', Casual: 'casual', Playful: 'playful' };
        const { creditCost, result } = await createJob('script_generation', campaignId, {
          imageDescription: anchor.prompt,
          businessName: 'My Business',
          platform: PLATFORM_MAP[scriptPlatform] ?? scriptPlatform,
          tone: TONE_MAP[scriptTone] ?? scriptTone,
          maxWords: 50,
        });
        setCreditBalance(creditBalance - (creditCost ?? 1));
        updateExpansion('script', { id: 'done', status: 'ready', type: 'script', content: result ?? '', createdAt: new Date().toISOString() });
        toast.success('Caption ready');
        return;
      }

      const jobType =
        type === 'video' ? (`video_${videoDuration}s` as 'video_10s' | 'video_30s' | 'video_60s')
        : 'music_generation';

      const jobParams: Record<string, unknown> =
        type === 'video'
          ? { imageUrl: anchor.url, prompt: anchor.prompt, duration: videoDuration }
          : { mood: videoMood, prompt: anchor.prompt };

      const { jobId, creditCost } = await createJob(jobType, campaignId, jobParams);
      setCreditBalance(creditBalance - (creditCost ?? 0));

      pollJob(
        jobId,
        async (job) => {
          updateExpansion(type, {
            id: (job.id as string) ?? 'done',
            status: 'ready',
            type,
            createdAt: (job.createdAt as string) ?? new Date().toISOString(),
            url: (job.outputUrl as string) ?? (job.outputUrls as string[])?.[0],
          });
          toast.success(`${TITLES[type]} ready`);
          await syncBalance();
        },
        (msg) => {
          updateExpansion(type, { id: 'error', status: 'failed', type, createdAt: new Date().toISOString() });
          toast.error(msg);
        },
      );
    } catch (err: unknown) {
      updateExpansion(type, { id: 'error', status: 'failed', type, createdAt: new Date().toISOString() });
      toast.error((err as Error).message ?? 'Generation failed');
    }
  };

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

      {/* Format cards — 3 columns */}
      <div className="flex-1 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <FormatCard type="video" title="Video" subtitle="10–60s cinematic clip" cost="15–80 cr" icon={Film}
            onGenerate={() => handleGenerate('video')}>
            <div className="flex gap-2">
              {([10, 30, 60] as const).map(t => (
                <button key={t} type="button" onClick={() => setVideoDuration(t)}
                  className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${videoDuration === t ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50 hover:text-primary'}`}>
                  {t}s
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="music" title="Music" subtitle="30s background track" cost="8 cr" icon={Music}
            onGenerate={() => handleGenerate('music')}>
            <div className="grid grid-cols-2 gap-1.5">
              {['Uplifting', 'Corporate', 'Dramatic', 'Chill'].map(m => (
                <button key={m} type="button" onClick={() => setVideoMood(m)}
                  className={`py-1.5 text-xs rounded-full border transition-colors ${videoMood === m ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50 hover:text-primary'}`}>
                  {m}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="script" title="Caption" subtitle="Platform-ready caption" cost="1 cr" icon={FileText}
            onGenerate={() => handleGenerate('script')}>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Platform</span>
                <div className="flex gap-1 flex-wrap flex-1">
                  {['IG', 'LI', 'TikTok'].map(p => (
                    <button key={p} type="button" onClick={() => setScriptPlatform(p)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${scriptPlatform === p ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Tone</span>
                <div className="flex gap-1 flex-wrap flex-1">
                  {['Pro', 'Casual', 'Playful'].map(t => (
                    <button key={t} type="button" onClick={() => setScriptTone(t)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${scriptTone === t ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                      {t}
                    </button>
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
