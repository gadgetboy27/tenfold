import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { Twitter, Linkedin, Instagram, Facebook, Youtube, Calendar, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function Step5Publish() {
  const { generatedAssets, selectedAnchorId, expansions, currentCampaignId, workspaceSlug, resetCampaign } = useAppStore();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin']);
  const [caption, setCaption] = useState(expansions.script?.content || 'Excited to share this new piece with the world.');
  const [isPublishing, setIsPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const platforms = [
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'hover:text-[#0A66C2] hover:border-[#0A66C2]' },
    { id: 'twitter', name: 'Twitter / X', icon: Twitter, color: 'hover:text-white hover:border-white' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'hover:text-[#E1306C] hover:border-[#E1306C]' },
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'hover:text-[#1877F2] hover:border-[#1877F2]' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'hover:text-[#FF0000] hover:border-[#FF0000]' },
  ];

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  };

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Select at least one platform');
      return;
    }
    setIsPublishing(true);
    try {
      const token = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : undefined;

      const res = await api('/api/publish', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: currentCampaignId ?? 'demo',
          platforms: selectedPlatforms,
          caption,
          anchorAssetId: selectedAnchorId,
        }),
        token: token ?? undefined,
        workspaceSlug,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Publish failed (${res.status})`);
      }

      setPublished(true);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  if (published) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full flex flex-col items-center justify-center relative overflow-hidden"
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ x: '50%', y: '50%', scale: 0, opacity: 1 }}
            animate={{
              x: `${Math.random() * 100}vw`,
              y: `${Math.random() * 100}vh`,
              scale: [0, 1, 0],
              opacity: [1, 1, 0],
              rotate: Math.random() * 360,
            }}
            transition={{ duration: 2, ease: 'easeOut', delay: Math.random() * 0.2 }}
            className="absolute w-2 h-2 rounded-sm z-0"
            style={{
              left: 0, top: 0,
              backgroundColor: Math.random() > 0.5 ? '#7C5CFC' : 'white',
            }}
          />
        ))}

        <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-6 z-10">
          <Send className="w-10 h-10 text-primary translate-x-1 -translate-y-1" />
        </div>

        <h2 className="font-serif text-4xl font-bold text-foreground mb-4 z-10 text-center">Your content is live</h2>
        <p className="text-muted-foreground text-lg mb-8 z-10 text-center max-w-md">
          Successfully published to {selectedPlatforms.map(p => platforms.find(pl => pl.id === p)?.name).join(', ')}.
        </p>

        <div className="flex gap-4 z-10">
          <Button variant="outline" className="border-border text-foreground hover:bg-secondary">View analytics</Button>
          <Button
            className="bg-primary text-white hover:bg-primary/90"
            onClick={resetCampaign}
          >
            Start new campaign
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      {/* Final Preview (Left) */}
      <div className="flex-1 bg-card border border-border rounded-xl p-6 flex flex-col overflow-y-auto">
        <h3 className="font-medium text-sm text-muted-foreground mb-4 uppercase tracking-wider">Final Preview</h3>
        <div className="max-w-md mx-auto w-full bg-background border border-border rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 flex items-center gap-3 border-b border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs">ACME</div>
            <div>
              <div className="text-sm font-medium text-foreground">Acme Corp</div>
              <div className="text-xs text-muted-foreground">Just now</div>
            </div>
          </div>
          <div className="p-4 text-sm text-foreground whitespace-pre-wrap">{caption}</div>
          {anchor && (
            <div className="w-full aspect-square bg-secondary">
              <img src={anchor.url} alt="Final" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 flex gap-4 border-t border-border">
            <div className="w-16 h-4 bg-secondary rounded"></div>
            <div className="w-16 h-4 bg-secondary rounded"></div>
            <div className="w-16 h-4 bg-secondary rounded"></div>
          </div>
        </div>
      </div>

      {/* Publication Settings (Right) */}
      <div className="w-full md:w-[400px] flex flex-col gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col flex-1 overflow-y-auto space-y-6">

          <section>
            <h3 className="font-medium text-sm text-foreground mb-3">Select Platforms</h3>
            <div className="grid grid-cols-2 gap-2">
              {platforms.map(p => {
                const Icon = p.icon;
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : `border-border bg-background text-muted-foreground ${p.color}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="font-medium text-sm text-foreground mb-3">Caption</h3>
            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="min-h-[150px] bg-background border-border text-sm resize-none"
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground">Adjust automatically per platform</span>
              <span className={`text-xs ${caption.length > 2200 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {caption.length} / 2200
              </span>
            </div>
          </section>

          <section>
            <h3 className="font-medium text-sm text-foreground mb-3">Schedule</h3>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30">Post Now</Button>
              <Button variant="outline" className="flex-1 border-border text-muted-foreground hover:text-foreground">
                <Calendar className="w-4 h-4 mr-2" /> Schedule
              </Button>
            </div>
          </section>
        </div>

        <Button
          onClick={handlePublish}
          disabled={isPublishing || selectedPlatforms.length === 0}
          className="w-full h-14 bg-gradient-to-r from-primary to-[#9D84FD] hover:from-primary/90 hover:to-[#9D84FD]/90 text-white font-medium text-lg rounded-xl shadow-lg shadow-primary/20"
        >
          {isPublishing ? 'Publishing...' : `Publish to ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}
