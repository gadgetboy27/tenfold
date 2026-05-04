import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Play, Loader2, CheckCircle, Music2, FileText, LayoutGrid } from 'lucide-react';
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

function VideoReady({ url }: { url?: string }) {
  return (
    <div className="relative rounded-lg overflow-hidden aspect-video bg-black/40 mb-4">
      {url ? (
        <img src={url} alt="Video preview" className="w-full h-full object-cover opacity-70" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-primary/5">
          <Play className="w-8 h-8 text-primary/40" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-110 transition-transform cursor-pointer">
          <Play className="w-5 h-5 text-white ml-1" />
        </div>
      </div>
      <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider">
        READY
      </div>
    </div>
  );
}

function MusicReady() {
  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
          <Music2 className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Track ready</p>
          <p className="text-xs text-muted-foreground">30s background music</p>
        </div>
        <div className="ml-auto">
          <div className="w-8 h-8 rounded-full bg-green-500/80 flex items-center justify-center cursor-pointer hover:bg-green-500 transition-colors">
            <Play className="w-3.5 h-3.5 text-white ml-0.5" />
          </div>
        </div>
      </div>
      {/* Waveform bars */}
      <div className="flex items-end gap-0.5 h-8">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full bg-green-500/50"
            style={{ height: `${20 + Math.sin(i * 0.8) * 12 + Math.cos(i * 1.3) * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ScriptReady({ content }: { content?: string }) {
  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Caption ready</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed line-clamp-4">
        {content ?? 'Your caption has been generated.'}
      </p>
      <button className="mt-2 text-xs text-primary hover:underline">Copy to clipboard</button>
    </div>
  );
}

function VariationsReady({ anchorUrl }: { anchorUrl?: string }) {
  const seeds = [42, 99, 17, 55];
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {seeds.map((seed, i) => (
        <div key={seed} className="aspect-square rounded-lg overflow-hidden border border-green-500/20 relative">
          <img
            src={anchorUrl ? `https://picsum.photos/seed/${seed + Date.now() % 1000}/400/400` : `https://picsum.photos/seed/${seed}/400/400`}
            alt={`Variation ${i + 1}`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors cursor-pointer" />
        </div>
      ))}
    </div>
  );
}

export default function FormatCard({ type, title, subtitle, cost, icon: Icon, children, onGenerate }: FormatCardProps) {
  const { expansions, generatedAssets, selectedAnchorId } = useAppStore();
  const expansion = expansions[type];
  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const isGenerating = expansion?.status === 'generating';
  const isReady = expansion?.status === 'ready';

  return (
    <div
      data-guide-id={type}
      className={cn(
        'bg-card border rounded-xl p-5 flex flex-col relative overflow-hidden transition-all duration-300',
        isReady ? 'border-green-500/40 bg-green-500/[0.03]' : 'border-border hover:border-primary/50'
      )}
    >
      {/* Generating overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <span className="text-sm font-medium text-foreground animate-pulse">Generating {title.toLowerCase()}...</span>
        </div>
      )}

      {/* Header — always visible */}
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
          isReady ? 'bg-green-500/20' : 'bg-primary/10'
        )}>
          {isReady
            ? <CheckCircle className="w-5 h-5 text-green-400" />
            : <Icon className="w-5 h-5 text-primary" />
          }
        </div>
        <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-secondary rounded-md">{cost}</span>
      </div>

      <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>

      {/* Ready-state result */}
      {isReady && type === 'video' && <VideoReady url={expansion?.url ?? anchor?.url} />}
      {isReady && type === 'music' && <MusicReady />}
      {isReady && type === 'script' && <ScriptReady content={expansion?.content} />}
      {isReady && type === 'variations' && <VariationsReady anchorUrl={anchor?.url} />}

      {/* Controls — only shown before generation */}
      {!isReady && (
        <>
          <div className="space-y-4 flex-1">{children}</div>
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full border-primary text-primary hover:bg-primary hover:text-white transition-colors"
              onClick={onGenerate}
            >
              Generate {title}
            </Button>
          </div>
        </>
      )}

      {/* Re-generate option after ready */}
      {isReady && (
        <div className="mt-auto pt-3 border-t border-green-500/20">
          <button
            onClick={onGenerate}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Re-generate
          </button>
        </div>
      )}
    </div>
  );
}
