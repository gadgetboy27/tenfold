'use client';

import { useAppStore } from '@/store/useAppStore';
import SkeletonCard from '@/components/shared/SkeletonCard';
import CosmicBackground from '@/components/shared/CosmicBackground';
import ImageCard from '@/components/shared/ImageCard';
import PromptBuilder from '@/components/layout/PromptBuilder';
import { motion } from 'framer-motion';

const GRID_COLS: Record<string, string> = {
  '1:1':  'grid-cols-3',
  '4:5':  'grid-cols-4',
  '16:9': 'grid-cols-2',
  '9:16': 'grid-cols-4',
};

export default function Step1Create() {
  const { generatedAssets, isGenerating, aspectRatio } = useAppStore();
  const gridCols = GRID_COLS[aspectRatio] ?? 'grid-cols-3';

  // Generating — show skeletons
  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center pb-16 pt-8 relative">
        <CosmicBackground />
        <div className="relative w-full max-w-5xl mx-auto px-6" style={{ zIndex: 2 }}>
          <div className={`grid ${gridCols} gap-5`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i} aspectRatio={aspectRatio} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Has results — show image grid
  if (generatedAssets.length > 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center pb-16 pt-8 relative">
        <CosmicBackground />
        <div className="relative w-full max-w-5xl mx-auto px-6" style={{ zIndex: 2 }}>
          <div className={`grid ${gridCols} gap-5`}>
            {generatedAssets.map((asset, i) => (
              <ImageCard key={asset.id} asset={asset} index={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state — show prompt builder
  return (
    <div className="h-full flex flex-col items-center justify-center relative overflow-y-auto py-8 px-4">
      <CosmicBackground />
      <div className="relative w-full max-w-2xl mx-auto flex flex-col gap-6" style={{ zIndex: 2 }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold text-foreground mb-1 font-serif">Build your scene</h2>
          <p className="text-sm text-muted-foreground">
            Select from each category — Tenfold assembles the prompt for you.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <PromptBuilder />
        </motion.div>
      </div>
    </div>
  );
}
