'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, ArrowRight } from 'lucide-react';
import FormatCard from '@/components/shared/FormatCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import type { VideoStyle } from '@/lib/fal/prompts';

type ExpandType = 'video' | 'music' | 'script';

export default function Step3Expand() {
  const [videoDuration, setVideoDuration] = useState<10 | 30 | 60>(10);
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('Cinematic');
  const [musicGenre, setMusicGenre] = useState('Lo-fi Chill');
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
    updateExpansion(type, { status: 'pending', jobId: expansions[type]?.jobId });

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
        params.genre = musicGenre;
      } else if (type === 'video') {
        params.videoStyle = videoStyle;
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
        // Persist immediately — don't wait for "Continue to Compose"
        const saved = useAppStore.getState().expansions;
        if (currentCampaignId && currentCampaignId !== '__new__') {
          api(`/api/campaigns/${currentCampaignId}`, {
            method: 'PATCH',
            body: JSON.stringify({ expansion_data: saved }),
            workspaceSlug,
          }).catch(() => {});
        }
        return;
      }

      const INTERVAL = type === 'video' ? 6000 : 4000;
      const MAX_MS = type === 'video' ? 5 * 60 * 1000 : 3 * 60 * 1000;
      // eslint-disable-next-line react-hooks/purity
      const startedAt = Date.now();

      const poll = async (): Promise<void> => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        if (Date.now() - startedAt > MAX_MS) {
          throw new Error(
            type === 'video'
              ? 'Video generation timed out after 5 minutes — fal.ai may be under load. Your credits have not been charged. Please retry.'
              : 'Music generation timed out after 3 minutes. Please retry.',
          );
        }

        await new Promise((r) => setTimeout(r, INTERVAL));
        updateExpansion(type, { status: 'pending', elapsed });

        const res = await api(`/api/jobs/${postData.jobId}`, { workspaceSlug });
        if (!res.ok) throw new Error('Status check failed');

        const job = (await res.json()) as {
          status: string;
          outputUrls?: string[];
          errorMessage?: string | null;
          errorAnalysis?: string | null;
          suggestedPrompt?: string | null;
        };

        if (job.status === 'ready') {
          if (type === 'video') {
            const currentUrls = useAppStore.getState().expansions.video?.urls ?? [];
            updateExpansion(type, {
              status: 'ready',
              url: job.outputUrls?.[0],
              urls: [...currentUrls, job.outputUrls![0]],
              jobId: postData.jobId,
            });
          } else {
            updateExpansion(type, { status: 'ready', url: job.outputUrls?.[0], jobId: postData.jobId });
          }
          toast.success(`${type === 'video' ? 'Video' : 'Music'} ready`);
          syncBalance();
          const saved = useAppStore.getState().expansions;
          if (currentCampaignId && currentCampaignId !== '__new__') {
            api(`/api/campaigns/${currentCampaignId}`, {
              method: 'PATCH',
              body: JSON.stringify({ expansion_data: saved }),
              workspaceSlug,
            }).catch(() => {});
          }
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

  const handleRefresh = async (type: 'video' | 'music') => {
    const jobId = expansions[type]?.jobId;
    if (!jobId) return;
    try {
      const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
      if (!res.ok) return;
      const job = (await res.json()) as { status: string; outputUrls?: string[] };
      if (job.status === 'ready' && job.outputUrls?.[0]) {
        updateExpansion(type, { status: 'ready', url: job.outputUrls[0], jobId });
        const saved = useAppStore.getState().expansions;
        if (currentCampaignId && currentCampaignId !== '__new__') {
          api(`/api/campaigns/${currentCampaignId}`, {
            method: 'PATCH',
            body: JSON.stringify({ expansion_data: saved }),
            workspaceSlug,
          }).catch(() => {});
        }
        toast.success(`${type === 'video' ? 'Video' : 'Music'} found`);
      } else {
        toast.error(`${type === 'video' ? 'Video' : 'Music'} not ready yet — try again in a moment`);
      }
    } catch {
      toast.error(`Failed to check ${type} status`);
    }
  };

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
          <div className="relative aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
            <Image src={anchor.url} alt="Anchor" fill className="object-cover" sizes="224px" />
          </div>
          <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
            &ldquo;{anchor.prompt.substring(0, 80)}{anchor.prompt.length > 80 ? '…' : ''}&rdquo;
          </p>
        </div>

        {/* Format cards — scroll container needs bottom padding for the sticky bar */}
        <div className="flex-1 grid grid-cols-3 gap-4 content-start">
          <FormatCard
            type="video"
            title="Video"
            subtitle="10–60s cinematic clip"
            cost={`${CREDIT_COSTS[`video_${videoDuration}s` as 'video_10s' | 'video_30s' | 'video_60s']} cr`}
            icon={Film}
            onGenerate={() => handleGenerate('video')}
            onRefresh={() => handleRefresh('video')}
            onRegenerate={() => handleGenerate('video')}
            onSelect={(url) => updateExpansion('video', { url })}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                {([10, 30, 60] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVideoDuration(t)}
                    className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${
                      videoDuration === t
                        ? 'border-primary/50 text-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/50'
                    }`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {(['Cinematic', 'Fast-cut', 'Dramatic', 'Smooth'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setVideoStyle(s)}
                    className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${
                      videoStyle === s
                        ? 'border-primary/50 text-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </FormatCard>

          <FormatCard
            type="music"
            title="Music"
            subtitle="30s background track"
            cost="8 cr"
            icon={Music}
            onGenerate={() => handleGenerate('music')}
            onRefresh={() => handleRefresh('music')}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {['Epic Cinematic', 'Lo-fi Chill', 'Corporate Jazz', 'Electronic', 'Acoustic Folk', 'Hip-hop Beat'].map(
                (g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setMusicGenre(g)}
                    className={`py-1.5 text-xs rounded-full border transition-colors ${
                      musicGenre === g
                        ? 'border-primary/50 text-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/50'
                    }`}
                  >
                    {g}
                  </button>
                ),
              )}
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
