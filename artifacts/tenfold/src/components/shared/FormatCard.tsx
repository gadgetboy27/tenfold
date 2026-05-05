import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Play, Loader2, CheckCircle, Music2, FileText, ChevronLeft, ChevronRight, PenTool, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CardType = 'video' | 'music' | 'script' | 'slides' | 'logo';

interface FormatCardProps {
  type: CardType;
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
      {url
        ? <img src={url} alt="Video preview" className="w-full h-full object-cover opacity-70" />
        : <div className="w-full h-full flex items-center justify-center bg-primary/5"><Play className="w-8 h-8 text-primary/40" /></div>
      }
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-110 transition-transform cursor-pointer">
          <Play className="w-5 h-5 text-white ml-1" />
        </div>
      </div>
      <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider">READY</div>
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
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Track ready</p>
          <p className="text-xs text-muted-foreground">30s background music</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-green-500/80 flex items-center justify-center cursor-pointer hover:bg-green-500 transition-colors">
          <Play className="w-3.5 h-3.5 text-white ml-0.5" />
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-8">
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-full bg-green-500/50"
            style={{ height: `${20 + Math.sin(i * 0.8) * 12 + Math.cos(i * 1.3) * 8}%` }} />
        ))}
      </div>
    </div>
  );
}

function ScriptReady({ content }: { content?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard access denied — silently ignore */
    }
  };

  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Caption ready</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed line-clamp-4">
        {content ?? 'Your caption has been generated.'}
      </p>
      <button
        onClick={handleCopy}
        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1 transition-colors"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy to clipboard'}
      </button>
    </div>
  );
}

function SlidesReady({ urls }: { urls?: string[] }) {
  const [active, setActive] = React.useState(0);

  if (!urls || urls.length === 0) {
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-6 mb-4 flex flex-col items-center justify-center gap-2 text-center">
        <CheckCircle className="w-6 h-6 text-green-400" />
        <p className="text-sm font-medium text-foreground">Slide deck generated</p>
        <p className="text-xs text-muted-foreground">Preview unavailable — download link will appear here once ready.</p>
      </div>
    );
  }

  const prev = () => setActive(a => Math.max(0, a - 1));
  const next = () => setActive(a => Math.min(urls.length - 1, a + 1));

  return (
    <div className="mb-4">
      <div className="relative rounded-lg overflow-hidden aspect-video bg-black/40 mb-2">
        <img src={urls[active]} alt={`Slide ${active + 1}`} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/30" />
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-mono px-2 py-0.5 rounded">
          {active + 1} / {urls.length}
        </div>
        {active > 0 && (
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
        )}
        {active < urls.length - 1 && (
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors">
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              'shrink-0 w-14 rounded overflow-hidden border transition-all',
              i === active ? 'border-green-400 opacity-100' : 'border-border opacity-50 hover:opacity-75'
            )}
          >
            <img src={url} alt={`Slide ${i + 1}`} className="w-full aspect-video object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function LogoReady({ urls }: { urls?: string[] }) {
  const variants = [
    { label: 'Dark', filter: 'none', bg: 'bg-[#0A0A0A]' },
    { label: 'Light', filter: 'invert(1) brightness(1.1)', bg: 'bg-white' },
    { label: 'Mono', filter: 'grayscale(1) contrast(1.3)', bg: 'bg-zinc-900' },
    { label: 'Color', filter: 'saturate(1.6) contrast(1.1)', bg: 'bg-zinc-800' },
  ];

  if (!urls || urls.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2 mb-4">
        {variants.map(v => (
          <div key={v.label} className={`rounded-lg border border-border ${v.bg} p-2 flex items-center justify-center aspect-square`}>
            <PenTool className="w-6 h-6 text-green-400/50" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {variants.map((v, i) => (
        <div key={v.label} className={`rounded-lg overflow-hidden border border-border ${v.bg} p-2 relative group cursor-pointer`}>
          <img
            src={urls[i] ?? urls[0]}
            alt={`Logo variant ${v.label}`}
            className="w-full aspect-square object-cover rounded"
            style={{ filter: v.filter }}
          />
          <div className="absolute inset-0 flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">{v.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FormatCard({ type, title, subtitle, cost, icon: Icon, children, onGenerate }: FormatCardProps) {
  const { expansions, generatedAssets, selectedAnchorId } = useAppStore();
  const expansion = expansions[type as keyof typeof expansions];
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
      {isGenerating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <span className="text-sm font-medium text-foreground animate-pulse">Generating {title.toLowerCase()}...</span>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center transition-colors', isReady ? 'bg-green-500/20' : 'bg-primary/10')}>
          {isReady
            ? <CheckCircle className="w-5 h-5 text-green-400" />
            : <Icon className="w-5 h-5 text-primary" />
          }
        </div>
        <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-secondary rounded-md">{cost}</span>
      </div>

      <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>

      {isReady && type === 'video'  && <VideoReady url={expansion?.url ?? anchor?.url} />}
      {isReady && type === 'music'  && <MusicReady />}
      {isReady && type === 'script' && <ScriptReady content={expansion?.content} />}
      {isReady && type === 'slides' && <SlidesReady urls={expansion?.urls} />}
      {isReady && type === 'logo'   && <LogoReady urls={expansion?.urls} />}

      {!isReady && (
        <>
          <div className="space-y-4 flex-1">{children}</div>
          <div className="mt-4 pt-4 border-t border-border">
            <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-white transition-colors" onClick={onGenerate}>
              Generate {title}
            </Button>
          </div>
        </>
      )}

      {isReady && (
        <div className="mt-auto pt-3 border-t border-green-500/20">
          <button onClick={onGenerate} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            Re-generate
          </button>
        </div>
      )}
    </div>
  );
}
