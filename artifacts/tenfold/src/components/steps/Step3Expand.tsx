import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, LayoutGrid } from 'lucide-react';
import FormatCard from '../shared/FormatCard';
import AnchorGuide from '../shared/AnchorGuide';
import toast from 'react-hot-toast';

export default function Step3Expand() {
  const [showGuide, setShowGuide] = useState(true);
  const { generatedAssets, selectedAnchorId, updateExpansion, setCreditBalance, creditBalance } = useAppStore();

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const handleGenerate = (type: 'video' | 'music' | 'script' | 'variations', cost: number) => {
    if (creditBalance < cost) {
      toast.error(`Insufficient credits. Need ${cost} cr.`);
      return;
    }

    setCreditBalance(creditBalance - cost);
    updateExpansion(type, { id: Date.now().toString(), status: 'generating', type, createdAt: new Date().toISOString() });

    setTimeout(() => {
      updateExpansion(type, { 
        id: Date.now().toString(), 
        status: 'ready', 
        type, 
        createdAt: new Date().toISOString(),
        url: type === 'video' ? anchor?.url : undefined,
        content: type === 'script' ? 'A captivating new chapter begins. Dive into the world of limitless creativity.' : undefined
      });
      toast.success(`${type} generation complete!`);
    }, 3000);
  };

  if (!anchor) return null;

  return (
    <div className="h-full flex gap-8 relative">
      {showGuide && <AnchorGuide onDismiss={() => setShowGuide(false)} />}
      <div className="w-72 shrink-0 space-y-4">
        <h2 className="font-serif text-xl font-bold text-foreground">Your anchor</h2>
        <div className="aspect-square rounded-xl overflow-hidden border border-border shadow-lg">
          <img src={anchor.url} alt="Anchor" className="w-full h-full object-cover" />
        </div>
        <p className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
          "{anchor.prompt.substring(0, 80)}..."
        </p>
      </div>

      <div className="flex-1">
        <div className="grid grid-cols-2 gap-4 auto-rows-fr">
          <FormatCard
            type="video"
            title="Video"
            subtitle="10 to 60 second cinematic clip"
            cost="15-80 cr"
            icon={Film}
            onGenerate={() => handleGenerate('video', 15)}
          >
            <div className="flex gap-2">
              {['10s', '30s', '60s'].map(t => (
                <button key={t} className="flex-1 py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors focus:bg-primary/20 focus:border-primary focus:text-primary">
                  {t}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard
            type="music"
            title="Music"
            subtitle="30s background track"
            cost="8 cr"
            icon={Music}
            onGenerate={() => handleGenerate('music', 8)}
          >
            <div className="grid grid-cols-2 gap-2">
              {['Uplifting', 'Corporate', 'Dramatic', 'Chill'].map(m => (
                <button key={m} className="py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors focus:bg-primary/20 focus:border-primary focus:text-primary">
                  {m}
                </button>
              ))}
            </div>
          </FormatCard>

          <FormatCard
            type="script"
            title="Script"
            subtitle="Caption or voiceover"
            cost="1 cr"
            icon={FileText}
            onGenerate={() => handleGenerate('script', 1)}
          >
             <div className="space-y-2">
               <div className="flex gap-2">
                 <span className="text-[10px] text-muted-foreground uppercase w-12 pt-1">Platform</span>
                 <div className="flex flex-wrap gap-1 flex-1">
                   {['IG', 'LI', 'TikTok'].map(p => (
                     <button key={p} className="px-2 py-1 text-[10px] rounded border border-border bg-background">{p}</button>
                   ))}
                 </div>
               </div>
               <div className="flex gap-2">
                 <span className="text-[10px] text-muted-foreground uppercase w-12 pt-1">Tone</span>
                 <div className="flex flex-wrap gap-1 flex-1">
                   {['Pro', 'Casual', 'Playful'].map(t => (
                     <button key={t} className="px-2 py-1 text-[10px] rounded border border-border bg-background">{t}</button>
                   ))}
                 </div>
               </div>
             </div>
          </FormatCard>

          <FormatCard
            type="variations"
            title="More Images"
            subtitle="Variations of your anchor"
            cost="3 cr/ea"
            icon={LayoutGrid}
            onGenerate={() => handleGenerate('variations', 3)}
          >
            <div className="text-sm text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg">
              Generate 4 new variations
            </div>
          </FormatCard>
        </div>
      </div>
    </div>
  );
}
