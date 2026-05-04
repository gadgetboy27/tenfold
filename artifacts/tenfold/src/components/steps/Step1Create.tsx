import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles } from 'lucide-react';
import SkeletonCard from '../shared/SkeletonCard';
import { motion } from 'framer-motion';
import ImageCard from '../shared/ImageCard';

export default function Step1Create() {
  const { generatedAssets, isGenerating } = useAppStore();

  if (generatedAssets.length === 0 && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
          <span className="font-serif text-[40vh] font-bold">T</span>
        </div>
        
        <div className="relative z-10 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground mb-3">Describe what you want to create</h2>
          <p className="text-muted-foreground">Tenfold will generate 6 image variations for you to choose from</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center pb-20 pt-8">
      <div className="w-full max-w-5xl mx-auto">
        <div className="grid grid-cols-3 gap-6">
          {isGenerating ? (
            Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i} />
            ))
          ) : (
            generatedAssets.map((asset, i) => (
              <ImageCard key={asset.id} asset={asset} index={i} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
