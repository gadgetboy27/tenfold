'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles, SlidersHorizontal, RefreshCw, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

/* ─── Prompt categories ───────────────────────────────────────────── */
const CATEGORIES = {
  subject: {
    label: 'Subject',
    hint: 'What is in the scene?',
    multiple: true,
    required: true,
    options: ['Person / People', 'Product', 'Landscape / Nature', 'Architecture', 'Food & Drink', 'Technology', 'Abstract', 'Animal'],
  },
  setting: {
    label: 'Setting',
    hint: 'Where does it take place?',
    multiple: false,
    required: true,
    options: ['Office / Workspace', 'Outdoors / Nature', 'Studio', 'Urban / City', 'Home Interior', 'Retail / Store', 'Conference Room', 'Neutral Background'],
  },
  mood: {
    label: 'Mood',
    hint: 'What feeling should it evoke?',
    multiple: false,
    required: true,
    options: ['Professional', 'Inspiring', 'Dramatic', 'Calm & Serene', 'Energetic', 'Premium / Luxury', 'Playful', 'Aspirational'],
  },
  lighting: {
    label: 'Lighting',
    hint: 'How is it lit?',
    multiple: false,
    required: false,
    options: ['Golden Hour', 'Studio Lighting', 'Natural Daylight', 'Dramatic / Moody', 'Neon / Night', 'Backlit', 'Soft Diffused', 'Rim Light'],
  },
  composition: {
    label: 'Composition',
    hint: 'How is it framed?',
    multiple: false,
    required: false,
    options: ['Close-up / Portrait', 'Wide Shot', 'Aerial / Bird\'s Eye', 'Medium Shot', 'Rule of Thirds', 'Symmetrical'],
  },
} as const;

type CategoryKey = keyof typeof CATEGORIES;

const ASPECT_RATIOS = ['1:1', '4:5', '16:9', '9:16'];
const STYLES = ['Photorealistic', 'Illustration', 'Cinematic', '3D'];

const STYLE_SUFFIXES: Record<string, string> = {
  Photorealistic: 'photorealistic, ultra-detailed, 8k resolution, sharp focus, professional photography, natural lighting, lifelike textures',
  Illustration:   'digital illustration, highly detailed artwork, vibrant colors, professional illustration, clean lines, artstation quality',
  Cinematic:      'cinematic, dramatic lighting, film grain, anamorphic lens, color graded, shallow depth of field, movie still, widescreen',
  '3D':           '3D render, octane render, physically based rendering, studio lighting, 8k, subsurface scattering, hyperrealistic materials',
};

function buildPrompt(selections: Record<CategoryKey, string[]>, extraDetail: string, style: string): string {
  const parts: string[] = [];

  const subjects = selections.subject;
  if (subjects.length) parts.push(subjects.join(', '));

  const setting = selections.setting[0];
  if (setting) parts.push(`in ${setting.toLowerCase()}`);

  const mood = selections.mood[0];
  if (mood) parts.push(`${mood.toLowerCase()} atmosphere`);

  const lighting = selections.lighting[0];
  if (lighting) parts.push(`${lighting.toLowerCase()} lighting`);

  const composition = selections.composition[0];
  if (composition) parts.push(composition.toLowerCase());

  if (extraDetail.trim()) parts.push(extraDetail.trim());

  const suffix = STYLE_SUFFIXES[style];
  if (suffix) parts.push(suffix);

  return parts.join(', ');
}

function isReadyToGenerate(selections: Record<CategoryKey, string[]>): boolean {
  return (
    selections.subject.length > 0 &&
    selections.setting.length > 0 &&
    selections.mood.length > 0
  );
}

/* ─── Chip component ──────────────────────────────────────────────── */
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
        selected
          ? 'bg-[#7C5CFC]/20 text-[#9D84FD] border-[#7C5CFC]/50 shadow-[0_0_8px_rgba(124,92,252,0.2)]'
          : 'bg-white/[0.03] text-[#888] border-white/10 hover:border-white/20 hover:text-[#ccc]'
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
export default function PromptBuilder() {
  const [selections, setSelections] = useState<Record<CategoryKey, string[]>>({
    subject: [], setting: [], mood: [], lighting: [], composition: [],
  });
  const [extraDetail, setExtraDetail] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    setCreditBalance, setIsGenerating, setGeneratedAssets, isGenerating,
    aspectRatio, style, setAspectRatio, setStyle,
    numInferenceSteps, guidanceScale, seed,
    setNumInferenceSteps, setGuidanceScale, setSeed,
    setStep, completeStep, setCampaignId, workspaceSlug, creditBalance,
  } = useAppStore();

  const toggle = (cat: CategoryKey, option: string) => {
    const def = CATEGORIES[cat];
    setSelections(prev => {
      const current = prev[cat];
      if (def.multiple) {
        return { ...prev, [cat]: current.includes(option) ? current.filter(o => o !== option) : [...current, option] };
      }
      return { ...prev, [cat]: current[0] === option ? [] : [option] };
    });
  };

  const ready = isReadyToGenerate(selections);
  const assembledPrompt = ready ? buildPrompt(selections, extraDetail, style) : '';

  const handleGenerate = async () => {
    if (!ready || isGenerating) return;
    setIsGenerating(true);

    try {
      const campRes = await api('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          prompt: assembledPrompt,
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
      setCampaignId(camp.campaignId);

      api('/api/credits/balance', { workspaceSlug })
        .then(r => r.json())
        .then((d: { balance?: number }) => { if (typeof d.balance === 'number') setCreditBalance(d.balance); })
        .catch(() => {});

      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ >= 60) throw new Error('Generation timed out — please try again');
        await new Promise(r => setTimeout(r, 1500));

        const statusRes = await api(`/api/campaigns/${camp.campaignId}`, { workspaceSlug });
        if (!statusRes.ok) throw new Error('Failed to check generation status');

        const campaign = await statusRes.json() as {
          status: string;
          assets: Array<{ id: string; url: string; prompt: string; aspectRatio: string; style: string; createdAt: string }>;
        };

        if (campaign.status === 'ready') {
          const readyAssets = campaign.assets.filter(a => a.url);
          if (readyAssets.length === 0) throw new Error('Generation completed but no images returned. Please try again.');
          setGeneratedAssets(readyAssets.map(a => ({
            id: a.id, url: a.url, prompt: a.prompt || assembledPrompt,
            aspectRatio: a.aspectRatio || aspectRatio, style: a.style || style, createdAt: a.createdAt,
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
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      {/* Builder card */}
      <div
        className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(17,17,17,0.82)', backdropFilter: 'blur(18px)' }}
      >
        {/* Toolbar: ratio + style */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.06]">
          <span className="text-[10px] font-mono text-[#444] uppercase tracking-wider mr-1">Ratio</span>
          {ASPECT_RATIOS.map(r => (
            <button key={r} type="button" onClick={() => setAspectRatio(r)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all border ${aspectRatio === r ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border-[#7C5CFC]/40' : 'text-[#888] hover:text-[#F0F0F0] border-transparent'}`}>
              {r}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <span className="text-[10px] font-mono text-[#444] uppercase tracking-wider mr-1">Style</span>
          {STYLES.map(s => (
            <button key={s} type="button" onClick={() => setStyle(s)}
              className={`px-2.5 py-1 rounded-md text-xs transition-all border ${style === s ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border-[#7C5CFC]/40' : 'text-[#888] hover:text-[#F0F0F0] border-transparent'}`}>
              {s}
            </button>
          ))}
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className={`ml-auto p-1.5 rounded-md transition-all ${showAdvanced ? 'text-[#7C5CFC] bg-[#7C5CFC]/10' : 'text-[#555] hover:text-[#888]'}`}
            title="Advanced settings">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Advanced controls */}
        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div key="adv" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-4 pt-3 pb-2 border-b border-white/[0.06] flex flex-col gap-3">
                {/* Steps slider */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider w-16 shrink-0">Steps</span>
                  <input type="range" min={10} max={50} step={1} value={numInferenceSteps}
                    onChange={e => setNumInferenceSteps(Number(e.target.value))}
                    className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
                    style={{ background: `linear-gradient(to right, #7C5CFC ${((numInferenceSteps - 10) / 40) * 100}%, #2a2a2a ${((numInferenceSteps - 10) / 40) * 100}%)`, accentColor: '#7C5CFC' }} />
                  <span className="text-[10px] font-mono text-[#7C5CFC] w-8 text-right">{numInferenceSteps}</span>
                </div>
                {/* Guidance slider */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider w-16 shrink-0">Guidance</span>
                  <input type="range" min={1} max={10} step={0.5} value={guidanceScale}
                    onChange={e => setGuidanceScale(Number(e.target.value))}
                    className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
                    style={{ background: `linear-gradient(to right, #7C5CFC ${((guidanceScale - 1) / 9) * 100}%, #2a2a2a ${((guidanceScale - 1) / 9) * 100}%)`, accentColor: '#7C5CFC' }} />
                  <span className="text-[10px] font-mono text-[#7C5CFC] w-8 text-right">{guidanceScale.toFixed(1)}</span>
                </div>
                {/* Seed */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider w-16 shrink-0">Seed</span>
                  <input type="number" placeholder="random" value={seed ?? ''}
                    onChange={e => setSeed(e.target.value === '' ? null : Number(e.target.value))}
                    className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1 text-[11px] font-mono text-[#ccc] placeholder-[#444] outline-none focus:border-[#7C5CFC]/50 transition-colors" />
                  <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 2_147_483_647))}
                    className="p-1.5 rounded-md text-[#555] hover:text-[#888] transition-colors shrink-0">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category sections */}
        <div className="divide-y divide-white/[0.04]">
          {(Object.entries(CATEGORIES) as [CategoryKey, typeof CATEGORIES[CategoryKey]][]).map(([key, cat]) => (
            <div key={key} className="px-4 py-3">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[11px] font-semibold text-[#ccc] uppercase tracking-wider">{cat.label}</span>
                {cat.required && <span className="text-[9px] text-[#7C5CFC] font-mono">required</span>}
                <span className="text-[10px] text-[#444] ml-auto">{cat.hint}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.options.map(opt => (
                  <Chip
                    key={opt}
                    label={opt}
                    selected={selections[key].includes(opt)}
                    onClick={() => toggle(key, opt)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Extra detail free-text */}
          <div className="px-4 py-3">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[11px] font-semibold text-[#ccc] uppercase tracking-wider">Extra Detail</span>
              <span className="text-[9px] text-[#444] font-mono">optional</span>
              <span className="text-[10px] text-[#444] ml-auto">Add anything specific</span>
            </div>
            <input
              value={extraDetail}
              onChange={e => setExtraDetail(e.target.value)}
              placeholder="e.g. snow-capped mountains in the background, mist rising from the water..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#ccc] placeholder-[#333] outline-none focus:border-[#7C5CFC]/40 transition-colors"
            />
          </div>
        </div>

        {/* Assembled prompt preview + generate */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {ready && (
              <motion.div key="preview" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                <div className="flex items-start gap-1.5 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-wider shrink-0 mt-px">Sending →</span>
                  <span className="text-[10px] font-mono text-[#555] leading-relaxed line-clamp-2">{assembledPrompt}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!ready || isGenerating}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
              ready && !isGenerating
                ? 'bg-gradient-to-r from-[#7C5CFC] to-[#9D84FD] text-white shadow-lg shadow-[#7C5CFC]/25 hover:shadow-[#7C5CFC]/40 hover:scale-[1.01]'
                : 'bg-white/5 text-[#444] cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating
              ? 'Generating...'
              : ready
              ? 'Generate · 18 cr'
              : 'Select Subject, Setting & Mood to generate'}
          </button>

          {!ready && (
            <div className="flex items-center justify-center gap-4">
              {(['subject', 'setting', 'mood'] as const).map(k => (
                <div key={k} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${selections[k].length > 0 ? 'bg-emerald-500' : 'bg-[#333]'}`} />
                  <span className="text-[10px] font-mono text-[#555] capitalize">{k}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
