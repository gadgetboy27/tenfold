'use client';

import { type LucideIcon, Loader2, Check, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
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
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export default function FormatCard({ type, title, subtitle, cost, icon: Icon, onGenerate, onRefresh, children }: FormatCardProps) {
  const { expansions } = useAppStore();
  const expansion = expansions[type];
  const status = expansion?.status ?? 'idle';
  const hasUrl = !!(expansion?.url);
  const canRefresh = status === 'ready' && !hasUrl && !!expansion?.jobId && !!onRefresh;

  return (
    <div className={cn(
      'flex flex-col gap-4 bg-card border rounded-xl p-5 transition-all duration-200',
      status === 'ready'  ? 'border-success/40 bg-success/5' :
      status === 'failed' ? 'border-destructive/30 bg-destructive/5' :
      'border-border hover:border-border/80',
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            status === 'ready' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary',
          )}>
            {status === 'ready' ? <Check className="w-4 h-4" /> : status === 'failed' ? <AlertCircle className="w-4 h-4 text-destructive" /> : <Icon className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">{cost}</span>
      </div>

      {children && (
        <div className="border-t border-border/50 pt-4">
          {children}
        </div>
      )}

      {status === 'ready' && hasUrl && type !== 'script' && (
        <div className="border-t border-border/50 pt-4 space-y-2">
          {type === 'video' && (
            <>
              <video src={expansion!.url} controls className="w-full rounded-lg aspect-video bg-black" />
              <a
                href={expansion!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open video in new tab
              </a>
            </>
          )}
          {type === 'music' && (
            <audio src={expansion!.url} controls className="w-full" />
          )}
        </div>
      )}

      {status === 'ready' && !hasUrl && type !== 'script' && (
        <div className="border-t border-destructive/20 pt-4">
          <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">
              {title} was generated but the URL wasn&apos;t saved correctly.{' '}
              {canRefresh ? 'Click "Check again" to retrieve it.' : 'Click "Regenerate" to create a new one.'}
            </p>
          </div>
        </div>
      )}

      {status === 'ready' && type === 'script' && expansion?.content && (
        <div className="border-t border-border/50 pt-4">
          <p className="text-sm text-foreground bg-secondary/50 rounded-lg p-3 italic">&ldquo;{expansion.content}&rdquo;</p>
        </div>
      )}

      {status === 'failed' && expansion?.error && (
        <div className="border-t border-destructive/20 pt-4">
          <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">{expansion.error}</p>
          </div>
        </div>
      )}

      {canRefresh ? (
        <Button
          onClick={onRefresh}
          variant="outline"
          className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
          size="sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Check again
        </Button>
      ) : (
        <Button
          onClick={status === 'ready' && hasUrl ? undefined : onGenerate}
          disabled={status === 'pending' || (status === 'ready' && hasUrl)}
          variant={status === 'ready' && hasUrl ? 'secondary' : 'default'}
          className={cn('w-full gap-2', status === 'ready' && hasUrl && 'opacity-60')}
          size="sm"
        >
          {status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {status === 'ready' && hasUrl
            ? `${title} ready`
            : status === 'ready' && !hasUrl
              ? `Regenerate ${title}`
              : status === 'pending'
                ? expansion?.elapsed ? `Generating… ${expansion.elapsed}s` : 'Generating…'
                : status === 'failed' ? 'Retry' : `Generate ${title}`
          }
        </Button>
      )}
    </div>
  );
}
