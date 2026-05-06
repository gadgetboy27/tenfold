'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText } from 'lucide-react';
import FormatCard from '@/components/shared/FormatCard';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type ExpandType = 'video' | 'music' | 'script';

const JOB_TYPE: Record<ExpandType, string> = {
  video: 'video',
  music: 'music',
  script: 'script',
};

// Normalise the job response — backends vary on field naming (camelCase vs snake_case)
function extractUrl(job: Record<string, unknown>): string | undefined {
  return (
    (job.outputUrl as string | undefined) ||
    (job.output_url as string | undefined) ||
    (job.url as string | undefined) ||
    (job.videoUrl as string | undefined) ||
    (job.audioUrl as string | undefined) ||
    (job.mediaUrl as string | undefined) ||
    undefined
  );
}

function extractText(job: Record<string, unknown>): string | undefined {
  return (
    (job.outputText as string | undefined) ||
    (job.output_text as string | undefined) ||
    (job.text as string | undefined) ||
    (job.caption as string | undefined) ||
    (job.script as string | undefined) ||
    (job.content as string | undefined) ||
    undefined
  );
}

export default function Step3Expand() {
  const [videoDuration, setVideoDuration] = useState<10 | 30 | 60>(10);
  const [videoMood, setVideoMood] = useState('Uplifting');
  const [scriptPlatform, setScriptPlatform] = useState('IG');
  const [scriptTone, setScriptTone] = useState('Pro');

  const {
    generatedAssets, selectedAnchorId, updateExpansion,
    setCreditBalance, creditBalance, currentCampaignId, workspaceSlug,
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

      const body: Record<string, unknown> = {
        type: JOB_TYPE[type],
        campaignId,
        anchorAssetId: selectedAnchorId,
      };
      if (type === 'video')  body.duration = videoDuration;
      if (type === 'music')  body.mood = videoMood;
      if (type === 'script') {
        body.platform = PLATFORM_MAP[scriptPlatform] ?? scriptPlatform.toLowerCase();
        body.tone     = TONE_MAP[scriptTone] ?? scriptTone.toLowerCase();
      }

      const jobRes = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(body),
        workspaceSlug,
      });

      if (!jobRes.ok) {
        const e = await jobRes.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? `Job failed (${jobRes.status})`);
      }

      const jobData = await jobRes.json() as { jobId?: string; job_id?: string; id?: string; creditCost?: number; credit_cost?: number };
      const jobId = jobData.jobId ?? jobData.job_id ?? jobData.id;
      if (!jobId) throw new Error('No job ID returned from server');

      const creditCost = jobData.creditCost ?? jobData.credit_cost ?? 0;
      setCreditBalance(creditBalance - creditCost);

      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 40) throw new Error('Job timed out — the server may still be processing. Check back later.');
        await new Promise(r => setTimeout(r, 2000));

        const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
        if (!res.ok) throw new Error('Status check failed');

        const job = await res.json() as Record<string, unknown>;
        const jobStatus = (job.status as string) ?? '';

        if (jobStatus === 'ready' || jobStatus === 'completed' || jobStatus === 'done') {
          const outputUrl = extractUrl(job);
          const outputText = extractText(job);

          updateExpansion(type, {
            status: 'ready',
            url: outputUrl,
            content: outputText,
          });

          if (!outputUrl && !outputText) {
            toast.success(`${title(type)} generated — but no output URL was returned. Try regenerating.`);
          } else {
            toast.success(`${title(type)} ready!`);
          }
          syncBalance();
        } else if (jobStatus === 'failed' || jobStatus === 'error') {
          throw new Error('Generation failed on the server');
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

  function title(type: ExpandType) {
    return type === 'video' ? 'Video' : type === 'music' ? 'Music' : 'Caption';
  }

  if (!anchor) return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      No anchor selected — go back to step 2.
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-8">
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

        {/* Format cards */}
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
