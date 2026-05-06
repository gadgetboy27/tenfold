'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '4:5', value: '4:5' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];
const STYLES = ['Photorealistic', 'Illustration', 'Cinematic', '3D'];

const ASPECT_MAP: Record<string, string> = {
  '1:1': 'square_hd',
  '4:5': 'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
};

function analyzePrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return null;

  const SUBJECT_WORDS = ['person','woman','man','founder','ceo','team','product','building','brand','professional','executive','speaker','entrepreneur','leader'];
  const SETTING_WORDS = ['office','outdoor','studio','conference','city','stage','room','street','nature','indoor','urban','rooftop','boardroom'];
  const STYLE_WORDS   = ['cinematic','professional','editorial','minimal','bold','warm','dark','bright','moody','photorealistic','vibrant','commercial'];
  const MOOD_WORDS    = ['inspiring','exciting','calm','energetic','confident','aspirational','premium','dynamic','powerful','elegant','luxurious'];
  const LIGHTING_WORDS= ['golden hour','backlit','rim light','soft light','studio lighting','natural light','neon','sunset','dawn','blue hour','spotlight'];

  const hasSubject  = SUBJECT_WORDS.some(w => text.includes(w)) || wordCount >= 8;
  const hasSetting  = SETTING_WORDS.some(w => text.includes(w));
  const hasStyle    = STYLE_WORDS.some(w => text.includes(w));
  const hasMood     = MOOD_WORDS.some(w => text.includes(w));
  const hasLighting = LIGHTING_WORDS.some(w => text.includes(w));

  const score = Math.min(100, Math.round(
    (hasSubject ? 90 : wordCount >= 5 ? 30 : 0) * 0.28 +
    (hasSetting ? 90 : 0) * 0.22 +
    (hasStyle ? 90 : 0) * 0.20 +
    (hasMood ? 90 : 0) * 0.18 +
    (hasLighting ? 90 : 0) * 0.12
  ));

  const additions: string[] = [];
  if (!hasSetting)  additions.push('in a modern professional setting');
  if (!hasStyle)    additions.push('cinematic composition');
  if (!hasMood)     additions.push('aspirational and confident');
  if (!hasLighting) additions.push('golden hour lighting');
  const enhanced = additions.length > 0 ? `${prompt}, ${additions.join(', ')}, ultra-high quality` : prompt;

  return { score, enhanced };
}

export default function FloatingPromptBar() {
  const [prompt, setPrompt] = useState('');
  const [analysis, setAnalysis] = useState<{ score: number; enhanced: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    creditBalance, setCreditBalance, setIsGenerating, setGeneratedAssets,
    isGenerating, aspectRatio, style, setAspectRatio, setStyle,
    setStep, completeStep, setCampaignId, workspaceSlug, currentCampaignId,
    currentStep,
  } = useAppStore();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) { setAnalysis(null); return; }
    debounceRef.current = setTimeout(() => setAnalysis(analyzePrompt(prompt)), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [prompt]);

  if (currentStep !== 1) return null;

  const isStrong = (analysis?.score ?? 0) >= 70;
  const isFair   = (analysis?.score ?? 0) >= 45;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    if (creditBalance < 18) { toast.error('Insufficient credits — need 18 cr to generate'); return; }

    setIsGenerating(true);
    setAnalysis(null);

    try {
      let campaignId = currentCampaignId;
      if (!campaignId) {
        const campRes = await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ prompt }), workspaceSlug });
        if (!campRes.ok) { const e = await campRes.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? `Campaign failed (${campRes.status})`); }
        const camp = await campRes.json() as { id: string };
        campaignId = camp.id;
        setCampaignId(campaignId);
      }

      const jobRes = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ type: 'image_generation', campaignId, params: { prompt, imageSize: ASPECT_MAP[aspectRatio] ?? 'square_hd' } }),
        workspaceSlug,
      });
      if (!jobRes.ok) { const e = await jobRes.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? `Job failed (${jobRes.status})`); }

      const { jobId, creditCost } = await jobRes.json() as { jobId: string; creditCost: number };
      setCreditBalance(creditBalance - (creditCost ?? 18));

      const poll = async (attempts = 0): Promise<void> => {
        if (attempts >= 40) throw new Error('Job timed out');
        const statusRes = await api(`/api/jobs/${jobId}`, { workspaceSlug });
        if (!statusRes.ok) throw new Error('Status check failed');
        const job = await statusRes.json() as { status: string; outputUrls?: string[]; assets?: Array<{ id: string; url: string }> };

        if (job.status === 'ready') {
          const dbAssets = job.assets ?? [];
          const urls = job.outputUrls ?? dbAssets.map((a) => a.url);
          if (urls.length === 0) throw new Error('Generation completed but no images returned');
          const newAssets = dbAssets.length > 0
            ? dbAssets.map((a) => ({ id: a.id, url: a.url, prompt, aspectRatio, style, createdAt: new Date().toISOString() }))
            : urls.map((url, i) => ({ id: `asset-${Date.now()}-${i}`, url, prompt, aspectRatio, style, createdAt: new Date().toISOString() }));
          setGeneratedAssets(newAssets);
          setIsGenerating(false);
          completeStep(1);
          setStep(2);
          toast.success('6 images ready — pick your anchor');
          api('/api/credits/balance', { workspaceSlug }).then(r => r.json()).then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); }).catch(() => {});
        } else if (job.status === 'failed') {
          throw new Error('Generation failed');
        } else {
          await new Promise(r => setTimeout(r, 1500));
          return poll(attempts + 1);
        }
      };

      await new Promise(r => setTimeout(r, 1000));
      await poll();
    } catch (err: unknown) {
      setIsGenerating(false);
      toast.error((err as Error).message ?? 'Generation failed');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4"
    >
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl border border-white/10 mt-2"
        style={{
          background: 'rgba(17,17,17,0.82)',
          backdropFilter: 'blur(18px)',
          boxShadow: isStrong
            ? '0 0 0 1px rgba(34,197,94,0.3), 0 20px 60px rgba(0,0,0,0.6)'
            : isFair
            ? '0 0 0 1px rgba(245,158,11,0.2), 0 20px 60px rgba(0,0,0,0.6)'
            : '0 20px 60px rgba(0,0,0,0.6)',
          transition: 'box-shadow 0.4s ease',
        }}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.06]">
          <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">Ratio</span>
          {ASPECT_RATIOS.map(r => (
            <button key={r.value} type="button" onClick={() => setAspectRatio(r.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${aspectRatio === r.value ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40' : 'text-[#888] hover:text-[#F0F0F0] border border-transparent'}`}
              data-testid={`button-ratio-${r.value}`}>{r.label}</button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">Style</span>
          {STYLES.map(s => (
            <button key={s} type="button" onClick={() => setStyle(s)}
              className={`px-2.5 py-1 rounded-md text-xs transition-all ${style === s ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40' : 'text-[#888] hover:text-[#F0F0F0] border border-transparent'}`}
              data-testid={`button-style-${s}`}>{s}</button>
          ))}
          {analysis && (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: isStrong ? '#22C55E' : isFair ? '#F59E0B' : '#EF4444' }} />
              <span className="text-[10px] font-mono" style={{ color: isStrong ? '#22C55E' : isFair ? '#F59E0B' : '#EF4444' }}>{analysis.score}/100</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A confident founder presenting at a tech conference, golden hour lighting, professional, aspirational..."
            className="flex-1 bg-transparent text-[#F0F0F0] placeholder-[#444] text-sm outline-none"
            data-testid="input-prompt"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isGenerating}
            data-testid="button-generate"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              prompt.trim() && !isGenerating
                ? 'bg-gradient-to-r from-[#7C5CFC] to-[#9D84FD] text-white shadow-lg shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 hover:scale-[1.02]'
                : 'bg-white/5 text-[#444] cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isGenerating ? 'Generating...' : 'Generate · 18 cr'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
