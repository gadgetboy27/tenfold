import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Film, Music, FileText, LayoutGrid, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormatCardProps {
  type: 'video' | 'music' | 'script' | 'variations';
  title: string;
  subtitle: string;
  cost: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onGenerate: () => void;
}

export default function FormatCard({ type, title, subtitle, cost, icon: Icon, children, onGenerate }: FormatCardProps) {
  const { expansions } = useAppStore();
  const expansion = expansions[type];
  
  const isGenerating = expansion?.status === 'generating';
  const isReady = expansion?.status === 'ready';

  return (
    <div className={cn(
      "bg-card border rounded-xl p-5 flex flex-col relative overflow-hidden transition-colors",
      isReady ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50"
    )}>
      {isGenerating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <span className="text-sm font-medium text-foreground animate-pulse">Generating {type}...</span>
        </div>
      )}

      {isReady && type === 'video' && expansion.url && (
        <div className="absolute inset-0 z-10">
          <img src={expansion.url} alt="Video preview" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 group cursor-pointer hover:bg-black/50 transition-colors">
            <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-white ml-1" />
            </div>
          </div>
          <div className="absolute top-3 right-3 bg-success text-success-foreground text-[10px] font-bold px-2 py-1 rounded-full">
            READY
          </div>
        </div>
      )}

      <div className={cn("flex-1", isReady ? "opacity-0 pointer-events-none" : "")}>
        <div className="flex justify-between items-start mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-secondary rounded-md">{cost}</span>
        </div>
        
        <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        
        <div className="space-y-4 flex-1">
          {children}
        </div>
      </div>

      <div className={cn("mt-4 pt-4 border-t border-border", isReady ? "opacity-0 pointer-events-none" : "")}>
        <Button 
          variant="outline" 
          className="w-full border-primary text-primary hover:bg-primary hover:text-white transition-colors"
          onClick={onGenerate}
        >
          Generate {title}
        </Button>
      </div>
    </div>
  );
}
