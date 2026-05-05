import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckSquare, Image as ImageIcon, Type, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function Step4Compose() {
  const { generatedAssets, selectedAnchorId, expansions, setStep, completeStep, currentCampaignId, setCompositionId, workspaceSlug } = useAppStore();
  const [caption, setCaption] = useState(expansions.script?.content || '');
  const [isSaving, setIsSaving] = useState(false);

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;

      const res = await api('/api/compositions', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: currentCampaignId ?? 'demo',
          anchorAssetId: selectedAnchorId,
          format: 'square',
          textOverlays: caption ? [{ text: caption, position: 'bottom', style: {} }] : [],
          branding: { logo: false, primaryColor: false },
          caption,
          hashtags: [],
        }),
        token: token ?? undefined,
        workspaceSlug,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Save failed (${res.status})`);
      }

      const composition = await res.json() as { id: string };
      setCompositionId(composition.id);
      toast.success('Composition ready');
      completeStep(4);
      setStep(5);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save composition');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      {/* Live Preview (Left) */}
      <div className="flex-1 bg-card border border-border rounded-xl flex items-center justify-center overflow-hidden relative">
        {anchor && (
          <div className="relative w-full max-w-sm aspect-square bg-background shadow-2xl">
            <img src={anchor.url} alt="Composition Preview" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-12">
              <p className="text-white text-sm font-medium drop-shadow-md line-clamp-3">{caption}</p>
            </div>
            <div className="absolute top-4 right-4 w-8 h-8 bg-white rounded flex items-center justify-center opacity-80 shadow-md">
              <span className="text-black font-bold text-xs">ACME</span>
            </div>
          </div>
        )}
      </div>

      {/* Composition Controls (Right) */}
      <div className="w-full md:w-96 flex flex-col gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col flex-1 overflow-y-auto space-y-6">

          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
              <Type className="w-4 h-4 text-primary" /> Caption & Text
            </div>
            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="min-h-[120px] bg-background border-border text-sm resize-none"
              placeholder="Write a caption..."
            />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
              <Palette className="w-4 h-4 text-primary" /> Brand Kit
            </div>
            <div className="space-y-3 bg-background p-3 rounded-lg border border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Apply brand logo</span>
                <div className="w-8 h-4 bg-primary rounded-full relative">
                  <div className="absolute right-1 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Brand colors</span>
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
              <ImageIcon className="w-4 h-4 text-primary" /> Included Assets
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <CheckSquare className="w-4 h-4 text-primary" /> Anchor Image
              </div>
              {expansions.video?.status === 'ready' && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" /> Generated Video
                </div>
              )}
              {expansions.music?.status === 'ready' && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" /> Background Track
                </div>
              )}
              {expansions.script?.status === 'ready' && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" /> Caption
                </div>
              )}
              {expansions.slides?.status === 'ready' && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" /> Slide Deck
                </div>
              )}
              {expansions.logo?.status === 'ready' && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckSquare className="w-4 h-4 text-primary" /> Logo Design
                </div>
              )}
            </div>
          </section>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-medium text-base rounded-lg"
        >
          {isSaving ? 'Saving...' : 'Save Composition'}
        </Button>
      </div>
    </div>
  );
}
