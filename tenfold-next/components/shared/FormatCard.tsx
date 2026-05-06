'use client';

import { type LucideIcon, Loader2, Check, AlertCircle, ExternalLink, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormatCardProps {
  type: 'video' | 'music' | 'script';
  title: string;
  subtitle: string;
  cost: string;
  icon: LucideIcon;
  onGenerate: () => void;
  children?: React.ReactNode;
}

export default function FormatCard({ type, title, subtitle, cost, icon: Icon, onGenerate, children }: FormatCardProps) {
  const { expansions } = useAppStore();
  const expansion = expansions[type];
  const status = expansion?.status ?? 'idle';
  const url = expansion?.url;
  const content = expansion?.content;
  const hasOutput = url || content;

  return (
    <div className={cn(
      'flex flex-col gap-4 bg-card border rounded-xl p-5 transition-all duration-200',
      status === 'ready' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border hover:border-border/80',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            status === 'ready' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary/10 text-primary',
          )}>
            {status === 'ready'
              ? <Check className="w-4 h-4" />
              : status === 'failed'
              ? <AlertCircle className="w-4 h-4 text-destructive" />
              : <Icon className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">{cost}</span>
      </div>

      {/* Controls (only when idle/failed) */}
      {(status === 'idle' || status === 'failed') && children && (
        <div className="border-t border-border/50 pt-4">
          {children}
        </div>
      )}

      {/* Output — video */}
      {status === 'ready' && type === 'video' && (
        <div className="border-t border-border/50 pt-4 space-y-2">
          {url ? (
            <video src={url} controls playsInline className="w-full rounded-lg aspect-video bg-black" />
          ) : null}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open video in new tab
            </a>
          )}
          {!url && (
            <p className="text-xs text-muted-foreground italic">Video generated — URL unavailable. Try regenerating.</p>
          )}
        </div>
      )}

      {/* Output — music */}
      {status === 'ready' && type === 'music' && (
        <div className="border-t border-border/50 pt-4 space-y-2">
          {url ? (
            <audio src={url} controls className="w-full" />
          ) : null}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open audio in new tab
            </a>
          )}
          {!url && (
            <p className="text-xs text-muted-foreground italic">Track generated — URL unavailable. Try regenerating.</p>
          )}
        </div>
      )}

      {/* Output — script/caption */}
      {status === 'ready' && type === 'script' && (
        <div className="border-t border-border/50 pt-4">
          {content ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground bg-secondary/50 rounded-lg p-3 italic leading-relaxed">
                &ldquo;{content}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(content).then(() => {})}
                className="text-xs text-primary hover:underline"
              >
                Copy to clipboard
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Caption generated — content unavailable. Try regenerating.</p>
          )}
        </div>
      )}

      {/* Action button */}
      {status === 'idle' && (
        <Button onClick={onGenerate} className="w-full gap-2" size="sm">
          <Icon className="w-3.5 h-3.5" />
          Generate {title}
        </Button>
      )}

      {status === 'pending' && (
        <Button disabled className="w-full gap-2" size="sm">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating...
        </Button>
      )}

      {status === 'failed' && (
        <Button onClick={onGenerate} variant="destructive" className="w-full gap-2" size="sm">
          <AlertCircle className="w-3.5 h-3.5" />
          Retry
        </Button>
      )}

      {status === 'ready' && (
        <Button
          onClick={onGenerate}
          variant="outline"
          className="w-full gap-2 text-muted-foreground hover:text-foreground"
          size="sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Regenerate
        </Button>
      )}
    </div>
  );
}
