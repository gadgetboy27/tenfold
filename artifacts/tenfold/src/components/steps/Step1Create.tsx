import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';
import SkeletonCard from '../shared/SkeletonCard';
import CosmicBackground from '../shared/CosmicBackground';
import { motion } from 'framer-motion';
import ImageCard from '../shared/ImageCard';

export default function Step1Create() {
  const { generatedAssets, isGenerating } = useAppStore();

  if (generatedAssets.length === 0 && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center relative">
        <CosmicBackground />

        {/* Faint T watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ zIndex: 1 }}>
          <span className="font-serif font-bold text-white" style={{ fontSize: '38vh', opacity: 0.025, lineHeight: 1 }}>T</span>
        </div>

        <div className="relative text-center max-w-md mx-auto" style={{ zIndex: 2 }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(124,92,252,0.12)', border: '1px solid rgba(124,92,252,0.2)' }}
          >
            <Sparkles className="w-8 h-8 text-[#7C5CFC]" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl font-bold text-[#F0F0F0] mb-3"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            Describe what you want to create
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-[#888] text-base"
          >
            Tenfold will generate 6 image variations for you to choose from
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center pb-32 pt-8 relative">
      <CosmicBackground />
      <div className="relative w-full max-w-5xl mx-auto" style={{ zIndex: 2 }}>
        <div className="grid grid-cols-3 gap-5">
          {isGenerating
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} delay={i} />)
            : generatedAssets.map((asset, i) => <ImageCard key={asset.id} asset={asset} index={i} />)
          }
        </div>
      </div>
    </div>
  );
}
