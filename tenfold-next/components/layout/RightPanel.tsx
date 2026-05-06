'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ChevronDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const RATIO_SHAPES: Record<string, { h: string; w: string }> = {
  '1:1':  { h: 'h-8',  w: 'w-8' },
  '4:5':  { h: 'h-10', w: 'w-8' },
  '16:9': { h: 'h-6',  w: 'w-10' },
  '9:16': { h: 'h-10', w: 'w-6' },
};

export default function RightPanel() {
  const { currentStep, selectedAnchorId, generatedAssets, aspectRatio, style, setAspectRatio, setStyle } = useAppStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const anchor = generatedAssets.find((a) => a.id === selectedAnchorId);

  return (
    <aside className="w-64 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto">
      <div className="p-5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-5">Settings</h3>

        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Aspect Ratio</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(RATIO_SHAPES).map(([id, shape]) => (
                  <button key={id} onClick={() => setAspectRatio(id)} className="flex flex-col items-center gap-2 group">
                    <div className="h-12 flex items-center justify-center">
                      <div className={cn(
                        'border rounded-sm transition-colors',
                        shape.h, shape.w,
                        aspectRatio === id ? 'border-primary bg-primary/10' : 'border-border group-hover:border-primary/60',
                      )} />
                    </div>
                    <span className={cn('text-xs transition-colors', aspectRatio === id ? 'text-primary font-medium' : 'text-muted-foreground group-hover:text-foreground')}>{id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Style</label>
              <div className="flex flex-wrap gap-2">
                {['Photorealistic', 'Illustration', 'Cinematic', '3D'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                      style === s ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <button
                className="flex items-center justify-between w-full text-sm font-medium text-foreground mb-4"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <span className="flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /> Advanced</span>
                <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')} />
              </button>
              {advancedOpen && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Seed (Optional)</label>
                    <Input placeholder="Random" className="h-8 text-sm bg-background" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Negative Prompt</label>
                    <Textarea placeholder="ugly, blurry, poor quality..." className="min-h-[80px] text-sm bg-background resize-none" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-muted-foreground">Quality</label>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">High (+5 cr)</span>
                    </div>
                    <Slider defaultValue={[75]} max={100} step={25} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 2 && anchor && (
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Selected Anchor</label>
            <div className="aspect-square rounded-lg overflow-hidden border border-border">
              <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{anchor.prompt}</p>
          </div>
        )}

        {(currentStep === 3 || currentStep === 4 || currentStep === 5) && anchor && (
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Anchor Image</label>
            <div className="aspect-square rounded-lg overflow-hidden border border-border">
              <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {currentStep > 1 && !anchor && (
          <p className="text-xs text-muted-foreground">No anchor selected yet.</p>
        )}
      </div>
    </aside>
  );
}
