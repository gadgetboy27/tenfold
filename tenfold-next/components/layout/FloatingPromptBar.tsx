'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '4:5', value: '4:5' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

const STYLES = ['Photorealistic', 'Illustration', 'Cinematic', '3D'];

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic:
    'photorealistic, ultra-detailed, 8k resolution, sharp focus, professional photography, natural lighting, lifelike textures',
  Illustration:
    'digital illustration, highly detailed artwork, vibrant colors, professional illustration, clean lines, artstation quality',
  Cinematic:
    'cinematic, dramatic lighting, film grain, anamorphic lens, color graded, shallow depth of field, movie still, widescreen',
  '3D':
    '3D render, octane render, physically based rendering, studio lighting, 8k, subsurface scattering, hyperrealistic materials',
};

function buildEnrichedPrompt(userPrompt: string, style: string): string {
  const suffix = STYLE_SUFFIXES[style];
  if (!suffix) return userPrompt;
  const trimmed = userPrompt.trim().replace(/,?\s*$/, '');
  return `${trimmed}, ${suffix}`;
}

function analyzePrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return null;

  const hasSubject  = ['person','woman','man','founder','ceo','team','product','brand','professional'].some(w => text.includes(w)) || wordCount >= 8;
  const hasSetting  = ['office','outdoor','studio','conference','city','room','street','urban','rooftop','waterfall','mountain','forest','beach','landscape'].some(w => text.includes(w));
  const hasStyle    = ['cinematic','professional','editorial','minimal','bold','warm','dark','bright','moody','photorealistic'].some(w => text.includes(w));
  const hasMood     = ['inspiring','exciting','calm','energetic','confident','aspirational','premium','dynamic','powerful','serene','majestic','dramatic'].some(w => text.includes(w));
  const hasLighting = ['golden hour','backlit','rim light','soft light','studio lighting','natural light','neon','sunset','spotlight','snow','mist','fog'].some(w => text.includes(w));

  const score = Math.min(100, Math.round(
    (hasSubject ? 90 : wordCount >= 5 ? 30 : 0) * 0.28 +
    (hasSetting ? 90 : 0) * 0.22 +
    (hasStyle ? 90 : 0) * 0.20 +
    (hasMood ? 90 : 0) * 0.18 +
    (hasLighting ? 90 : 0) * 0.12
  ));

  return { score };
}

function SliderRow({ label, value, min, max, step, onChange, display }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, #7C5CFC ${((value - min) / (max - min)) * 100}%, #2a2a2a ${((value - min) / (max - min)) * 100}%)`,
          accentColor: '#7C5CFC',
        }}
      />
      <span className="text-[10px] font-mono text-[#7C5CFC] w-8 text-right shrink-0">{display}</span>
    </div>
  );
}

export default function FloatingPromptBar() {
  const [prompt, setPrompt] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    setCreditBalance, setIsGenerating, setGeneratedAssets,
    isGenerating, aspectRatio, style, setAspectRatio, setStyle,
    numInferenceSteps, guidanceScale, seed,
    setNumInferenceSteps, setGuidanceScale, setSeed,
    setStep, completeStep, setCampaignId, workspaceSlug, currentStep,
  } = useAppStore();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) { setScore(null); return; }
    debounceRef.current = setTimeout(() => {
      const result = analyzePrompt(prompt);
      setScore(result?.score ?? null);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [prompt]);

  if (currentStep !== 1) return null;

  const isStrong = (score ?? 0) >= 70;
  const isFair   = (score ?? 0) >= 45;

  const enrichedPrompt = prompt.trim() ? buildEnrichedPrompt(prompt, style) : '';
  const enrichedPreview = enrichedPrompt.length > 80
    ? enrichedPrompt.slice(0, 80) + '…'
    : enrichedPrompt;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      const campRes = await api('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          prompt: enrichedPrompt,
          aspectRatio,
          style,
          numInferenceSteps,
          guidanceScale,
          ...(seed !== null ? { seed } : {}),
        }),
        workspaceSlug,
      });

      if (!campRes.ok) {
        const e = await campRes.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? `Campaign failed (${campRes.status})`);
      }

      const camp = await campRes.json() as { campaignId: string; status: string };
      const campaignId = camp.campaignId;
      setCampaignId(campaignId);

      api('/api/credits/balance', { workspaceSlug })
        .then(r => r.json())
        .then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); })
        .catch(() => {});

      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 60) throw new Error('Generation timed out — please try again');
        await new Promise(r => setTimeout(r, 1500));

        const statusRes = await api(`/api/campaigns/${campaignId}`, { workspaceSlug });
        if (!statusRes.ok) throw new Error('Failed to check generation status');

        const campaign = await statusRes.json() as {
          status: string;
          assets: Array<{ id: string; url: string; prompt: string; aspectRatio: string; style: string; createdAt: string; status: string }>;
        };

        if (campaign.status === 'ready') {
          const readyAssets = campaign.assets.filter(a => a.url);
          if (readyAssets.length === 0) throw new Error('Generation completed but no images returned. Please try again.');

          setGeneratedAssets(readyAssets.map(a => ({
            id: a.id,
            url: a.url,
            prompt: a.prompt || prompt,
            aspectRatio: a.aspectRatio || aspectRatio,
            style: a.style || style,
            createdAt: a.createdAt,
          })));
          setIsGenerating(false);
          completeStep(1);
          setStep(2);
          toast.success('6 images ready — pick your anchor');

          api('/api/credits/balance', { workspaceSlug })
            .then(r => r.json())
            .then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); })
            .catch(() => {});
        } else if (campaign.status === 'failed') {
          throw new Error('Image generation failed — please try again');
        } else {
          return poll();
        }
      };

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
        {/* Aspect ratio + style + advanced toggle toolbar */}
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
          <div className="ml-auto flex items-center gap-2">
            {score !== null && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isStrong ? '#22C55E' : isFair ? '#F59E0B' : '#EF4444' }} />
                <span className="text-[10px] font-mono" style={{ color: isStrong ? '#22C55E' : isFair ? '#F59E0B' : '#EF4444' }}>{score}/100</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              data-testid="button-advanced"
              title="Advanced settings"
              className={`p-1.5 rounded-md transition-all ${showAdvanced ? 'text-[#7C5CFC] bg-[#7C5CFC]/10' : 'text-[#555] hover:text-[#888]'}`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Advanced controls */}
        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              key="advanced"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pt-3 pb-2 border-b border-white/[0.06] flex flex-col gap-3">
                <SliderRow
                  label="Steps"
                  value={numInferenceSteps}
                  min={10}
                  max={50}
                  step={1}
                  onChange={setNumInferenceSteps}
                  display={String(numInferenceSteps)}
                />
                <SliderRow
                  label="Guidance"
                  value={guidanceScale}
                  min={1}
                  max={10}
                  step={0.5}
                  onChange={setGuidanceScale}
                  display={guidanceScale.toFixed(1)}
                />
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider w-16 shrink-0">Seed</span>
                  <input
                    type="number"
                    placeholder="random"
                    value={seed ?? ''}
                    onChange={e => setSeed(e.target.value === '' ? null : Number(e.target.value))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1 text-[11px] font-mono text-[#ccc] placeholder-[#444] outline-none focus:border-[#7C5CFC]/50 transition-colors"
                    data-testid="input-seed"
                  />
                  <button
                    type="button"
                    title="Randomise seed"
                    onClick={() => setSeed(Math.floor(Math.random() * 2_147_483_647))}
                    className="p-1.5 rounded-md text-[#555] hover:text-[#888] transition-colors shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt input */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Waterfalls with a snow-filled backdrop, mist rising, golden hour..."
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

        {/* Enriched prompt preview */}
        <AnimatePresence initial={false}>
          {prompt.trim().length > 0 && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 flex items-start gap-1.5">
                <span className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-wider shrink-0 mt-px">Sending →</span>
                <span className="text-[10px] font-mono text-[#3a3a3a] leading-relaxed line-clamp-2">{enrichedPreview}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
}
