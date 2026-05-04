import React from 'react';
import { motion } from 'framer-motion';
import { Asset, useAppStore } from '@/store/useAppStore';
import { Maximize2, Shuffle, ArrowUp, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ImageCardProps {
  asset: Asset;
  index: number;
}

export default function ImageCard({ asset, index }: ImageCardProps) {
  const { selectedAnchorId, setAnchorId, setStep, completeStep } = useAppStore();
  const isSelected = selectedAnchorId === asset.id;
  const isDimmed = selectedAnchorId !== null && !isSelected;

  const handleSelect = () => {
    setAnchorId(asset.id);
  };

  const handleAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    console.log(`Action: ${action}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isDimmed ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      onClick={handleSelect}
      className={cn(
        "relative aspect-square rounded-xl overflow-hidden cursor-pointer group transition-all duration-200",
        isSelected ? "ring-2 ring-primary shadow-[inset_0_0_20px_rgba(124,92,252,0.3)]" : "hover:scale-[1.02] hover:ring-1 ring-border hover:ring-white/20"
      )}
    >
      <img 
        src={asset.url} 
        alt={asset.prompt}
        className="w-full h-full object-cover"
      />

      {isSelected && (
        <div className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full tracking-wider">
          ANCHOR
        </div>
      )}

      <div className={cn(
        "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 flex justify-center gap-2 opacity-0 transition-opacity duration-200",
        isSelected ? "opacity-100" : "group-hover:opacity-100"
      )}>
        <Button size="icon" variant="secondary" className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10" onClick={(e) => handleAction(e, 'expand')} title="Expand">
          <Maximize2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="secondary" className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10" onClick={(e) => handleAction(e, 'vary')} title="Vary">
          <Shuffle className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="secondary" className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10" onClick={(e) => handleAction(e, 'upscale')} title="Upscale">
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="secondary" className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10" onClick={(e) => handleAction(e, 'download')} title="Download">
          <Download className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
