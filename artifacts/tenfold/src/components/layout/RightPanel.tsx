import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ChevronDown, RefreshCw, Settings, Zap, Link as LinkIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function RightPanel() {
  const { currentStep, selectedAnchorId, generatedAssets, creditBalance, setCreditBalance, expansions, aspectRatio, style, setAspectRatio, setStyle } = useAppStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const anchor = generatedAssets.find(a => a.id === selectedAnchorId);

  const RATIO_SHAPES: Record<string, { h: string; w: string }> = {
    '1:1':  { h: 'h-8',  w: 'w-8' },
    '4:5':  { h: 'h-10', w: 'w-8' },
    '16:9': { h: 'h-6',  w: 'w-10' },
    '9:16': { h: 'h-10', w: 'w-6' },
  };

  const renderStep1Settings = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Aspect Ratio</label>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(RATIO_SHAPES).map(([id, shape]) => {
            const isActive = aspectRatio === id;
            return (
              <button key={id} onClick={() => setAspectRatio(id)} className="flex flex-col items-center gap-2 group">
                <div className="h-12 flex items-center justify-center">
                  <div className={`border rounded-sm transition-colors ${shape.h} ${shape.w} ${isActive ? 'border-primary bg-primary/10' : 'border-border group-hover:border-primary/60'}`} />
                </div>
                <span className={`text-xs transition-colors ${isActive ? 'text-primary font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>{id}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Style</label>
        <div className="flex flex-wrap gap-2">
          {['Photorealistic', 'Illustration', 'Cinematic', '3D'].map(s => {
            const isActive = style === s;
            return (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isActive ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground border border-transparent hover:text-foreground hover:border-muted-foreground/30'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <button 
          className="flex items-center justify-between w-full text-sm font-medium text-foreground mb-4"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /> Advanced Settings</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>

        {advancedOpen && (
          <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Seed (Optional)</label>
              <Input placeholder="Random" className="h-8 text-sm bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Negative Prompt</label>
              <Textarea placeholder="ugly, blurry, poor quality..." className="min-h-[80px] text-sm bg-background resize-none" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-muted-foreground">Quality</label>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">High (+5 cr)</span>
              </div>
              <Slider defaultValue={[75]} max={100} step={25} className="[&_[role=slider]]:bg-primary" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2Settings = () => (
    <div className="space-y-6">
      {anchor ? (
        <>
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Selected Anchor</label>
            <div className="aspect-square rounded-lg overflow-hidden border border-border">
              <img src={anchor.url} alt="Anchor thumbnail" className="w-full h-full object-cover" />
            </div>
          </div>
          
          <div className="space-y-3 pt-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Generation Details</label>
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="text-foreground">Tenfold V4 Cinematic</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seed</span>
                <span className="font-mono text-foreground">84729104</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">Just now</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Button 
              variant="outline" 
              className="w-full border-primary/50 text-primary hover:bg-primary hover:text-white"
              onClick={() => {
                if (creditBalance < 18) {
                  toast.error('Insufficient credits');
                  return;
                }
                setCreditBalance(creditBalance - 18);
                toast.success('Generating 6 more variations...');
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Generate 6 more (18 cr)
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground">Edit prompt</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground text-sm">
          Select an image from the canvas<br/>to view details and actions.
        </div>
      )}
    </div>
  );

  const renderStep3Settings = () => {
    const activeExps = Object.entries(expansions).filter(([_, e]) => e !== undefined);
    
    return (
      <div className="space-y-6">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Your Expansions</label>
        
        {activeExps.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No expansions generated yet.
          </div>
        ) : (
          <div className="space-y-3">
            {activeExps.map(([type, exp]) => {
              if (!exp) return null;
              return (
                <div key={type} className="flex items-center justify-between bg-secondary/50 p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Zap className={cn("w-4 h-4", exp.status === 'ready' ? "text-success" : "text-warning animate-pulse")} />
                    <span className="text-sm font-medium capitalize">{type}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full",
                    exp.status === 'ready' ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                  )}>
                    {exp.status.toUpperCase()}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="border-t border-border pt-6 mt-auto space-y-2">
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-white"
            disabled={!Object.values(expansions).some(e => e?.status === 'ready')}
            onClick={() => {
              useAppStore.getState().completeStep(3);
              useAppStore.getState().setStep(4);
            }}
          >
            Go to Compose →
          </Button>
          {!Object.values(expansions).some(e => e?.status === 'ready') && (
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
              onClick={() => {
                useAppStore.getState().completeStep(3);
                useAppStore.getState().setStep(4);
              }}
            >
              Skip — compose without expansions
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderStep4Settings = () => (
    <div className="space-y-6">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Format Setup</label>
      
      <div className="grid grid-cols-2 gap-2">
        {['Square Post', 'Story', 'Reel', 'Banner'].map((fmt, i) => (
          <button key={fmt} className={cn(
            "p-3 rounded-lg border text-sm text-left transition-colors",
            i === 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-muted-foreground"
          )}>
            <div className="font-medium">{fmt}</div>
            <div className="text-[10px] text-muted-foreground mt-1">1080x1080</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 border border-border rounded-lg">
        <span className="text-sm font-medium">Auto-size for platform</span>
        <Switch defaultChecked />
      </div>
    </div>
  );

  const renderStep5Settings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Connected Accounts</label>
        <button className="text-xs text-primary hover:underline flex items-center"><Plus className="w-3 h-3 mr-1" /> Connect</button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
          <div className="w-8 h-8 rounded bg-[#0A66C2] flex items-center justify-center text-white"><LinkIcon className="w-4 h-4" /></div>
          <div>
            <div className="text-sm font-medium">LinkedIn Page</div>
            <div className="text-xs text-muted-foreground">@acmecorp</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
          <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-black"><LinkIcon className="w-4 h-4" /></div>
          <div>
            <div className="text-sm font-medium">X (Twitter)</div>
            <div className="text-xs text-muted-foreground">@acme_hq</div>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-4">Recent Posts</label>
        <div className="space-y-3 opacity-60">
          <div className="h-16 border border-border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground">
            Product Launch Q3
          </div>
          <div className="h-16 border border-border border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground">
            Hiring Announcement
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <aside className="w-80 border-l border-border bg-card shrink-0 flex flex-col z-10">
      <div className="h-14 border-b border-border flex items-center px-4 font-medium text-sm text-foreground bg-card">
        {currentStep === 1 && "Generation Settings"}
        {currentStep === 2 && "Asset Details"}
        {currentStep === 3 && "Expansions Status"}
        {currentStep === 4 && "Composition Canvas"}
        {currentStep === 5 && "Publication Hub"}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 bg-card">
        {currentStep === 1 && renderStep1Settings()}
        {currentStep === 2 && renderStep2Settings()}
        {currentStep === 3 && renderStep3Settings()}
        {currentStep === 4 && renderStep4Settings()}
        {currentStep === 5 && renderStep5Settings()}
      </div>
    </aside>
  );
}
