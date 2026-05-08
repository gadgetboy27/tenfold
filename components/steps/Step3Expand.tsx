'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, ArrowRight } from 'lucide-react';
import FormatCard from '@/components/shared/FormatCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type ExpandType = 'video' | 'music' | 'script';

export default function Step3Expand() {
  const [videoDuration, setVideoDuration] = useState<10 | 30 | 60>(10);
  const [videoMood, setVideoMood] = useState('Uplifting');
  const [scriptPlatform, setScriptPlatform] = useState('IG');
  const [scriptTone, setScriptTone] = useState('Pro');

  const {
    generatedAssets, selectedAnchorId, updateExpansion,
    setCreditBalance, creditBalance, currentCampaignId, workspaceSlug,
    completeStep, setStep, expansions,
  } = useAppStore();
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const syncBalance = () => {
    api('/api/credits/balance', { workspaceSlug })
      .then(r => r.json())
      .then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); })
      .catch(() => {});
  };

  const handleGenerate = async (type: ExpandType) => {
    if (!anchor) return;
    updateExpansion(type, { status: 'pending' });

    try {
      const campaignId = currentCampaignId ?? 'demo';
      const PLATFORM_MAP: Record<string, string> = { IG: 'instagram', LI: 'linkedin', TikTok: 'tiktok' };
      const TONE_MAP: Record<string, string> = { Pro: 'professional', Casual: 'casual', Playful: 'playful' };

      const jobType =
        type === 'video'  ? (`video_${videoDuration}s` as 'video_10s' | 'video_30s' | 'video_60s') :
        type === 'music'  ? 'music_generation' :
                            'script_generation';

      const params: Record<string, unknown> = {
        imageUrl: anchor.url,
        prompt: anchor.prompt,
      };
      if (type === 'music') {
        params.mood = videoMood;
      } else if (type === 'script') {
        params.platform       = PLATFORM_MAP[scriptPlatform] ?? scriptPlatform.toLowerCase();
        params.tone           = TONE_MAP[scriptTone] ?? scriptTone.toLowerCase();
        params.imageDescription = anchor.prompt;
      }

      const jobRes = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ type: jobType, campaignId, params }),
        workspaceSlug,
      });

      if (!jobRes.ok) {
        const e = await jobRes.json().catch(() => ({})) as { error?: string; issues?: string[] };
        const detail = e.issues?.join('; ') ?? e.error ?? `Request failed (${jobRes.status})`;
        throw new Error(detail);
      }

      const postData = await jobRes.json() as {
        jobId: string; creditCost: number; status?: string; result?: string;
      };
      setCreditBalance(creditBalance - (postData.creditCost ?? 0));

      // Script generation is synchronous — POST returns final result directly
      if (postData.status === 'ready' && type === 'script') {
        updateExpansion(type, { status: 'ready', content: postData.result });
        toast.success('Caption ready');
        syncBalance();
        return;
      }

      // Async jobs (video, music) — poll until completed
      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 40) throw new Error('Job timed out');
        await new Promise(r => setTimeout(r, 1500));

        const res = await api(`/api/jobs/${postData.jobId}`, { workspaceSlug });
        if (!res.ok) throw new Error('Status check failed');

        const job = await res.json() as {
          status: string;
          outputUrls?: string[];
          errorMessage?: string | null;
          errorAnalysis?: string | null;
          suggestedPrompt?: string | null;
        };

        if (job.status === 'ready') {
          updateExpansion(type, { status: 'ready', url: job.outputUrls?.[0] });
          toast.success(`${type === 'video' ? 'Video' : 'Music'} ready`);
          syncBalance();
        } else if (job.status === 'failed') {
          const msg = job.errorAnalysis ?? job.errorMessage ?? 'Generation failed — please try again';
          const hint = job.suggestedPrompt ? ` Try: "${job.suggestedPrompt}"` : '';
          throw new Error(msg + hint);
        } else {
          return poll();
        }
      };

      await poll();
    } catch (err: unknown) {
      const message = (err as Error).message ?? 'Generation failed — please try again';
      updateExpansion(type, { status: 'failed', error: message });
      toast.error(message);
    }
  };

  const anyReady = expansions.video?.status === 'ready' || expansions.music?.status === 'ready' || expansions.script?.status === 'ready';

  if (!anchor) return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      No anchor selected — go back to step 2.
    </div>
  );

  return (
    <div className="h-full overflow-y-auto pb-28 p-8 relative">
      <div className="max-w-5xl mx-auto flex gap-8">
        {/* Anchor thumbnail */}
        <div className="w-56 shrink-0 space-y-4">
          <h2 className="font-serif text-xl font-bold text-foreground">Your anchor</h2>
          <div className="aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
            <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
          </div>
          <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
            &ldquo;{anchor.prompt.substring(0, 80)}{anchor.prompt.length > 80 ? '…' : ''}&rdquo;
          </p>
        </div>

        {/* Format cards — scroll container needs bottom padding for the sticky bar */}
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

      {/* Sticky continue bar — always visible, Expand is optional */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, delay: 0.2 }}
        className="fixed bottom-0 left-40 right-0 z-30 p-4 pointer-events-none"
      >
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div className="flex items-center justify-between bg-card/95 backdrop-blur-md border border-border rounded-2xl px-5 py-3 shadow-lg">
            <p className="text-sm text-muted-foreground">
              {anyReady
                ? `${[expansions.video, expansions.music, expansions.script].filter(e => e?.status === 'ready').length} asset${[expansions.video, expansions.music, expansions.script].filter(e => e?.status === 'ready').length !== 1 ? 's' : ''} ready — compose your post`
                : 'Generate assets above, or skip straight to compose'}
            </p>
            <Button
              onClick={() => {
                completeStep(3);
                setStep(4);
                if (currentCampaignId && currentCampaignId !== '__new__') {
                  api(`/api/campaigns/${currentCampaignId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ current_step: 4, expansion_data: expansions }),
                    workspaceSlug,
                  }).catch(() => {});
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-2 shrink-0"
            >
              Continue to Compose
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
