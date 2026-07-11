"use client";

import {
  type LucideIcon,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/brand/Spinner";
import { cn } from "@/lib/utils";

interface FormatCardProps {
  type: "video" | "music" | "script";
  title: string;
  subtitle: string;
  cost: string;
  icon: LucideIcon;
  onGenerate: () => void;
  onRefresh?: () => void;
  onRegenerate?: () => void;
  onSelect?: (url: string) => void;
  /** When true, the generate button is disabled and `lockedHint` is shown. */
  locked?: boolean;
  lockedHint?: string;
  children?: React.ReactNode;
}

export default function FormatCard({
  type,
  title,
  subtitle,
  cost,
  icon: Icon,
  onGenerate,
  onRefresh,
  onRegenerate,
  onSelect,
  locked,
  lockedHint,
  children,
}: FormatCardProps) {
  const { expansions } = useAppStore();
  const expansion = expansions[type];
  const status = expansion?.status ?? "idle";
  const hasUrl = !!expansion?.url;
  const hasVariants = type === "video" && !!expansion?.urls?.length;
  const canRefresh =
    status === "ready" && !hasUrl && !!expansion?.jobId && !!onRefresh;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 bg-card border rounded-xl p-5 transition-all duration-200",
        status === "ready"
          ? "border-success/40 bg-success/5"
          : status === "failed"
            ? "border-destructive/30 bg-destructive/5"
            : "border-border hover:border-border/80",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              status === "ready"
                ? "bg-success/10 text-success"
                : "bg-primary/10 text-primary",
            )}
          >
            {status === "ready" ? (
              <Check className="w-4 h-4" />
            ) : status === "failed" ? (
              <AlertCircle className="w-4 h-4 text-destructive" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
          {cost}
        </span>
      </div>

      {children && (
        <div className="border-t border-border/50 pt-4">{children}</div>
      )}

      {status === "ready" && hasUrl && type === "music" && (
        <div className="border-t border-border/50 pt-4 space-y-2">
          <audio src={expansion!.url} controls className="w-full" />
        </div>
      )}

      {hasVariants && type === "video" && (
        <div className="border-t border-border/50 pt-4 space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {expansion!.urls!.length} variant
            {expansion!.urls!.length !== 1 ? "s" : ""} — click to select
          </p>
          <div className="grid grid-cols-2 gap-2">
            {expansion!.urls!.map((url) => (
              <div
                key={url}
                onClick={() => onSelect?.(url)}
                className={`relative rounded-lg overflow-hidden cursor-pointer ring-2 transition-all ${
                  expansion!.url === url
                    ? "ring-primary"
                    : "ring-transparent hover:ring-primary/40"
                }`}
              >
                <video
                  src={url}
                  muted
                  loop
                  autoPlay
                  className="w-full aspect-video bg-black object-cover"
                />
                {expansion!.url === url && (
                  <div className="absolute inset-0 bg-primary/10 flex items-end justify-end p-1.5">
                    <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded font-medium">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            ))}
            {status === "pending" && (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <Spinner size={24} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <a
              href={expansion!.url ?? expansion!.urls![0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open selected
            </a>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                Generate another
              </button>
            )}
          </div>
        </div>
      )}

      {status === "ready" && hasUrl && type === "video" && !hasVariants && (
        <div className="border-t border-border/50 pt-4 space-y-2">
          <video
            src={expansion!.url}
            controls
            className="w-full rounded-lg aspect-video bg-black"
          />
          <a
            href={expansion!.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open video in new tab
          </a>
        </div>
      )}

      {status === "ready" && !hasUrl && type !== "script" && (
        <div className="border-t border-destructive/20 pt-4">
          <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">
              {title} was generated but the URL wasn&apos;t saved correctly.{" "}
              {canRefresh
                ? 'Click "Check again" to retrieve it.'
                : 'Click "Regenerate" to create a new one.'}
            </p>
          </div>
        </div>
      )}

      {status === "ready" && type === "script" && expansion?.content && (
        <div className="border-t border-border/50 pt-4">
          <p className="text-sm text-foreground bg-secondary/50 rounded-lg p-3 italic">
            &ldquo;{expansion.content}&rdquo;
          </p>
        </div>
      )}

      {status === "failed" && expansion?.error && (
        <div className="border-t border-destructive/20 pt-4">
          <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">
              {expansion.error}
            </p>
          </div>
        </div>
      )}

      {canRefresh ? (
        <div className="flex gap-2">
          <Button
            onClick={onRefresh}
            variant="outline"
            className="flex-1 gap-2 border-primary/30 text-primary hover:bg-primary/5"
            size="sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check again
          </Button>
          <Button
            onClick={onGenerate}
            variant="outline"
            className="flex-1 gap-2"
            size="sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </Button>
        </div>
      ) : (
        <>
          {!(type === "video" && hasVariants) && (
            <>
              {locked && lockedHint && (
                <p className="text-[11px] text-muted-foreground text-center mb-2">
                  {lockedHint}
                </p>
              )}
              <Button
                onClick={onGenerate}
                disabled={status === "pending" || locked}
                className="w-full gap-2"
                size="sm"
              >
                {status === "pending" && <Spinner size={14} />}
                {status === "pending"
                  ? expansion?.elapsed
                    ? `Generating… ${expansion.elapsed}s`
                    : "Generating…"
                  : status === "failed"
                    ? "Retry"
                    : status === "ready"
                      ? `Regenerate ${title}`
                      : `Generate ${title}`}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
