'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { Asset } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { Maximize2, Shuffle, ArrowUp, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ImageCardProps {
  asset: Asset;
  index: number;
}

const ASPECT_CLASSES: Record<string, string> = {
  '1:1':  'aspect-square',
  '4:5':  'aspect-[4/5]',
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
};

const STYLE_FILTERS: Record<string, string> = {
  'Photorealistic': 'none',
  'Illustration':   'saturate(1.5) contrast(1.05) hue-rotate(5deg)',
  'Cinematic':      'saturate(0.6) contrast(1.2) sepia(0.25) brightness(0.88)',
  '3D':             'brightness(1.08) contrast(1.22) saturate(1.35)',
};

const STYLE_LABEL_COLORS: Record<string, string> = {
  'Photorealistic': 'bg-sky-500/80',
  'Illustration':   'bg-rose-500/80',
  'Cinematic':      'bg-amber-600/80',
  '3D':             'bg-violet-500/80',
};

export default function ImageCard({ asset, index }: ImageCardProps) {
  const { selectedAnchorId, setAnchorId } = useAppStore();
  const isSelected = selectedAnchorId === asset.id;
  const isDimmed = selectedAnchorId !== null && !isSelected;

  const ratio = asset.aspectRatio ?? '1:1';
  const style = asset.style ?? 'Photorealistic';
  const aspectClass = ASPECT_CLASSES[ratio] ?? 'aspect-square';
  const filter = STYLE_FILTERS[style] ?? 'none';
  const labelColor = STYLE_LABEL_COLORS[style] ?? 'bg-slate-500/80';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isDimmed ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      onClick={() => setAnchorId(asset.id)}
      className={cn(
        `relative ${aspectClass} rounded-xl overflow-hidden cursor-pointer group transition-all duration-200`,
        isSelected
          ? 'ring-2 ring-primary shadow-[inset_0_0_20px_rgba(124,92,252,0.3)]'
          : 'hover:scale-[1.02] hover:ring-1 ring-border hover:ring-white/20'
      )}
    >
      <Image src={asset.url} alt={asset.prompt} fill className="object-cover transition-all duration-300" style={{ filter }} sizes="(max-width: 640px) 100vw, 50vw" />

      {style !== 'Photorealistic' && (
        <div className={`absolute top-2 left-2 ${labelColor} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wider backdrop-blur-sm`}>
          {style.toUpperCase()}
        </div>
      )}

      {isSelected && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full tracking-wider">
          ANCHOR
        </div>
      )}

      <div className={cn(
        'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 flex justify-center gap-2 opacity-0 transition-opacity duration-200',
        isSelected ? 'opacity-100' : 'group-hover:opacity-100'
      )}>
        {[
          { icon: Maximize2, label: 'Expand' },
          { icon: Shuffle, label: 'Vary' },
          { icon: ArrowUp, label: 'Upscale' },
          { icon: Download, label: 'Download' },
        ].map(({ icon: Icon, label }) => (
          <Button
            key={label}
            size="icon"
            variant="secondary"
            className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10"
            onClick={(e) => e.stopPropagation()}
            title={label}
          >
            <Icon className="w-4 h-4" />
          </Button>
        ))}
      </div>
    </motion.div>
  );
}
