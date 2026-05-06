'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText } from 'lucide-react';
import FormatCard from '@/components/shared/FormatCard';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type ExpandType = 'video' | 'music' | 'script';

async function createJob(type: string, campaignId: string, params: Record<string, unknown>, workspaceSlug: string) {
  const res = await api('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ type, campaignId, params }),
    workspaceSlug,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error ?? `Job failed (${res.status})`); }
  return res.json() as Promise<{ jobId: string; status: string; creditCost: number; result?: string }>;
}

export default function Step3Expand() {
  const [videoDuration, setVideoDuration] = useState<10 | 30 | 60>(10);
  const [videoMood, setVideoMood] = useState('Uplifting');
  const [scriptPlatform, setScriptPlatform] = useState('IG');
  const [scriptTone, setScriptTone] = useState('Pro');
  const { generatedAssets, selectedAnchorId, updateExpansion, setCreditBalance, creditBalance, currentCampaignId, workspaceSlug } = useAppStore();
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const handleGenerate = async (type: ExpandType) => {
    if (!anchor) return;
    updateExpansion(type, { status: 'pending' });

    try {
      const campaignId = currentCampaignId ?? 'demo';

      if (type === 'script') {
        const PLATFORM_MAP: Record<string, string> = { IG: 'instagram', LI: 'linkedin', TikTok: 'tiktok' };
        const TONE_MAP: Record<string, string> = { Pro: 'professional', Casual: 'casual', Playful: 'playful' };
        const { creditCost, result } = await createJob('script_generation', campaignId, {
          imageDescription: anchor.prompt,
          businessName: 'My Business',
          platform: PLATFORM_MAP[scriptPlatform] ?? scriptPlatform,
          tone: TONE_MAP[scriptTone] ?? scriptTone,
          maxWords: 50,
        }, workspaceSlug);
        setCreditBalance(creditBalance - (creditCost ?? 1));
        updateExpansion('script', { status: 'ready', content: result ?? '' });
        toast.success('Caption ready');
        return;
      }

      const jobType = type === 'video' ? `video_${videoDuration}s` : 'music_generation';
      const jobParams = type === 'video'
        ? { imageUrl: anchor.url, prompt: anchor.prompt, duration: videoDuration }
        : { mood: videoMood, prompt: anchor.prompt };

      const { jobId, creditCost } = await createJob(jobType, campaignId, jobParams, workspaceSlug);
      setCreditBalance(creditBalance - (creditCost ?? 0));

      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 40) throw new Error('Job timed out');
        await new Promise(r => setTimeout(r, 1500));
        const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
        if (!res.ok) throw new Error('Status check failed');
        const job = await res.json() as { status: string; outputUrl?: string; outputUrls?: string[] };
        if (job.status === 'ready') {
          updateExpansion(type, { status: 'ready', url: job.outputUrl ?? job.outputUrls?.[0] });
          toast.success(`${type === 'video' ? 'Video' : 'Music'} ready`);
          api('/api/credits/balance', { workspaceSlug }).then(r => r.json()).then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); }).catch(() => {});
        } else if (job.status === 'failed') {
          throw new Error('Generation failed');
        } else {
          return poll();
        }
      };
      await poll();
    } catch (err: unknown) {
      updateExpansion(type, { status: 'failed' });
      toast.error((err as Error).message ?? 'Generation failed');
    }
  };

  if (!anchor) return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      No anchor selected. Go back to step 2.
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto flex gap-8">
        <div className="w-56 shrink-0 space-y-4">
          <h2 className="font-serif text-xl font-bold text-foreground">Your anchor</h2>
          <div className="aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
            <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
          </div>
          <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
            &ldquo;{anchor.prompt.substring(0, 80)}{anchor.prompt.length > 80 ? '...' : ''}&rdquo;
          </p>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-4 content-start">
          <FormatCard type="video" title="Video" subtitle="10–60s cinematic clip" cost="15–80 cr" icon={Film} onGenerate={() => handleGenerate('video')}>
            <div className="flex gap-2">
              {([10, 30, 60] as const).map(t => (
                <button key={t} type="button" onClick={() => setVideoDuration(t)}
                  className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${videoDuration === t ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                  {t}s
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="music" title="Music" subtitle="30s background track" cost="8 cr" icon={Music} onGenerate={() => handleGenerate('music')}>
            <div className="grid grid-cols-2 gap-1.5">
              {['Uplifting', 'Corporate', 'Dramatic', 'Chill'].map(m => (
                <button key={m} type="button" onClick={() => setVideoMood(m)}
                  className={`py-1.5 text-xs rounded-full border transition-colors ${videoMood === m ? 'border-primary/50 text-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                  {m}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard type="script" title="Caption" subtitle="Platform-ready caption" cost="1 cr" icon={FileText} onGenerate={() => handleGenerate('script')}>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">Platform</span>
                <div className="flex gap-1">
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
                <div className="flex gap-1">
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
