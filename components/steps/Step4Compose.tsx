'use client';

import { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Type, Palette, RotateCcw, Maximize2, Upload, X, Music } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

function RedoRow({ label, onRedo, available }: { label: string; onRedo: () => void; available: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${available ? 'bg-green-400' : 'bg-border'}`} />
        <span className={`text-sm ${available ? 'text-foreground' : 'text-muted-foreground/50'}`}>{label}</span>
      </div>
      <button
        onClick={onRedo}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
      >
        <RotateCcw className="w-3 h-3" /> Redo
      </button>
    </div>
  );
}

export default function Step4Compose() {
  const {
    generatedAssets, selectedAnchorId, expansions,
    setStep, completeStep, currentCampaignId, setCompositionId, workspaceSlug,
  } = useAppStore();

  const [caption, setCaption] = useState(expansions.script?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);
  const video = expansions.video?.status === 'ready' ? expansions.video.url : null;
  const music = expansions.music?.status === 'ready' ? expansions.music.url : null;
  const hasScript = expansions.script?.status === 'ready';

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUrl(URL.createObjectURL(file));
    toast.success('Logo added');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api('/api/compositions', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: currentCampaignId ?? 'demo',
          anchorAssetId: selectedAnchorId,
          format: 'square',
          textOverlays: caption ? [{ text: caption, position: 'bottom', style: {} }] : [],
          branding: { logo: !!logoUrl, primaryColor: false },
          caption,
          hashtags: [],
        }),
        workspaceSlug,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? `Save failed (${res.status})`);
      }
      const composition = await res.json() as { id: string };
      setCompositionId(composition.id);
      toast.success('Composition ready');
      completeStep(4);
      setStep(5);
      if (currentCampaignId && currentCampaignId !== '__new__') {
        api(`/api/campaigns/${currentCampaignId}`, {
          method: 'PATCH',
          body: JSON.stringify({ current_step: 5 }),
          workspaceSlug,
        }).catch(() => {});
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save composition');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 p-6 overflow-y-auto">

      {/* ── Left: image + video + music ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Static image preview */}
        <div className="bg-card border border-border rounded-xl flex items-center justify-center p-4">
          {anchor ? (
            <div className="relative w-full max-w-xs aspect-square bg-background shadow-2xl rounded-xl overflow-hidden mx-auto">
              <img src={anchor.url} alt="Preview" className="w-full h-full object-cover" />
              {/* Caption overlay */}
              {caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-10">
                  <p className="text-white text-sm font-medium drop-shadow-md line-clamp-3">{caption}</p>
                </div>
              )}
              {/* Logo — click to upload */}
              <button
                onClick={() => logoInputRef.current?.click()}
                title="Click to upload your logo"
                className="absolute top-3 right-3 w-10 h-10 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow-md transition-all group"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded" />
                ) : (
                  <>
                    <span className="text-black font-bold text-[10px] group-hover:hidden">LOGO</span>
                    <Upload className="w-4 h-4 text-primary hidden group-hover:block" />
                  </>
                )}
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm p-8">No anchor image selected.</p>
          )}
        </div>

        {/* Video player */}
        {video && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Generated Video</span>
              <button
                onClick={() => setIsFullscreen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title="Fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <video src={video} controls className="w-full max-h-64 bg-black" />
          </div>
        )}

        {/* Music player */}
        {music && (
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Music className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground shrink-0">Background Track</span>
            <audio src={music} controls className="flex-1 h-8" />
          </div>
        )}
      </div>

      {/* ── Right: controls ── */}
      <div className="w-full md:w-88 flex flex-col gap-4 shrink-0" style={{ width: '22rem' }}>

        {/* Caption */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Type className="w-4 h-4 text-primary" /> Caption
          </div>
          <Textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            className="min-h-[100px] bg-background border-border text-sm resize-none"
            placeholder="Write a caption or generate one in Step 3…"
          />
        </div>

        {/* Logo upload */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Palette className="w-4 h-4 text-primary" /> Logo
          </div>
          <button
            onClick={() => logoInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
            ) : (
              <>
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Upload your logo — shown in top-right of ad</span>
              </>
            )}
          </button>
        </div>

        {/* Redo anything */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
            <RotateCcw className="w-4 h-4 text-primary" /> Redo anything
          </div>
          <div className="divide-y divide-border/50">
            <RedoRow label="Anchor image" onRedo={() => setStep(2)} available={!!anchor} />
            <RedoRow label="Video" onRedo={() => setStep(3)} available={!!video} />
            <RedoRow label="Music" onRedo={() => setStep(3)} available={!!music} />
            <RedoRow label="Caption" onRedo={() => setStep(3)} available={hasScript} />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-12 bg-primary text-white font-semibold text-base rounded-xl"
        >
          {isSaving ? 'Saving…' : 'Save & Continue to Publish'}
        </Button>
      </div>

      {/* ── Fullscreen video modal ── */}
      {isFullscreen && video && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <video
            src={video}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-5 right-5 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
