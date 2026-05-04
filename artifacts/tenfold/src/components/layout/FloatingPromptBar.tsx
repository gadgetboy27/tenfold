import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '4:5', value: '4:5' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

const STYLES = ['Photorealistic', 'Illustration', 'Cinematic', '3D'];

export default function FloatingPromptBar() {
  const [prompt, setPrompt] = useState('');
  const {
    creditBalance,
    setCreditBalance,
    setIsGenerating,
    setGeneratedAssets,
    isGenerating,
    aspectRatio,
    style,
    setAspectRatio,
    setStyle,
    setStep,
    completeStep,
  } = useAppStore();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    if (creditBalance < 18) {
      toast.error('Insufficient credits — need 18 cr to generate');
      return;
    }

    setCreditBalance(creditBalance - 18);
    setIsGenerating(true);

    setTimeout(() => {
      const newAssets = Array.from({ length: 6 }).map((_, i) => ({
        id: `asset-${Date.now()}-${i}`,
        url: `https://picsum.photos/seed/${Date.now() + i}/800/800`,
        prompt,
        aspectRatio,
        style,
        createdAt: new Date().toISOString(),
      }));
      setGeneratedAssets(newAssets);
      setIsGenerating(false);
      completeStep(1);
      setStep(2);
      toast.success('6 images ready — pick your anchor');
    }, 3000);
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
        className="rounded-2xl border border-white/10 shadow-2xl shadow-black/60"
        style={{ background: 'rgba(17,17,17,0.82)', backdropFilter: 'blur(18px)' }}
      >
        {/* Aspect + style row */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.06]">
          <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">Ratio</span>
          {ASPECT_RATIOS.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setAspectRatio(r.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                aspectRatio === r.value
                  ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40'
                  : 'text-[#888] hover:text-[#F0F0F0] border border-transparent'
              }`}
              data-testid={`button-ratio-${r.value}`}
            >
              {r.label}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1" />

          <span className="text-xs text-[#444] font-mono uppercase tracking-wider mr-1">Style</span>
          {STYLES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                style === s
                  ? 'bg-[#7C5CFC]/20 text-[#7C5CFC] border border-[#7C5CFC]/40'
                  : 'text-[#888] hover:text-[#F0F0F0] border border-transparent'
              }`}
              data-testid={`button-style-${s}`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Prompt input row */}
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
