'use client';

import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';
import SkeletonCard from '@/components/shared/SkeletonCard';
import CosmicBackground from '@/components/shared/CosmicBackground';
import { motion } from 'framer-motion';
import ImageCard from '@/components/shared/ImageCard';

const GRID_COLS: Record<string, string> = {
  '1:1':  'grid-cols-3',
  '4:5':  'grid-cols-4',
  '16:9': 'grid-cols-2',
  '9:16': 'grid-cols-4',
};

export default function Step1Create() {
  const { generatedAssets, isGenerating, aspectRatio } = useAppStore();
  const gridCols = GRID_COLS[aspectRatio] ?? 'grid-cols-3';

  if (generatedAssets.length === 0 && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center relative">
        <CosmicBackground />
        <div className="relative text-center max-w-md mx-auto" style={{ zIndex: 2 }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center justify-center mx-auto mb-6"
          >
            <Sparkles className="w-9 h-9 text-[#00D4FF]" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl font-bold text-foreground mb-3 font-serif"
          >
            Describe what you want to create
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-muted-foreground text-base"
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
      <div className="relative w-full max-w-5xl mx-auto px-6" style={{ zIndex: 2 }}>
        <div className={`grid ${gridCols} gap-5`}>
          {isGenerating
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} delay={i} aspectRatio={aspectRatio} />)
            : generatedAssets.map((asset, i) => <ImageCard key={asset.id} asset={asset} index={i} />)
          }
        </div>
      </div>
    </div>
  );
}
