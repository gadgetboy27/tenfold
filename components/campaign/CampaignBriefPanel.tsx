'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';
import type { CampaignAngle, CampaignBrief } from '@/lib/claude/campaign-brief';
import {
  Target, Zap, Heart, Lightbulb, ChevronDown, ChevronUp,
  Users, Globe, ExternalLink, CheckCircle2, ArrowRight, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const GOAL_META: Record<string, { icon: typeof Target; color: string; bg: string }> = {
  awareness:   { icon: Globe,      color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30' },
  conversion:  { icon: Target,     color: 'text-primary',    bg: 'bg-primary/10 border-primary/30' },
  engagement:  { icon: Heart,      color: 'text-pink-400',   bg: 'bg-pink-400/10 border-pink-400/30' },
  retention:   { icon: Zap,        color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/30' },
};
const DEFAULT_GOAL_META = { icon: Lightbulb, color: 'text-muted-foreground', bg: 'bg-secondary border-border' };

interface Props {
  onGenerate: (prompt: string, angleName: string) => void;
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-muted-foreground uppercase tracking-wider w-28 shrink-0 pt-0.5 font-mono">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function AngleCard({
  angle,
  selected,
  onSelect,
}: {
  angle: CampaignAngle;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = GOAL_META[angle.goal] ?? DEFAULT_GOAL_META;
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      onClick={onSelect}
      className={`rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden ${
        selected
          ? 'border-primary bg-primary/5 shadow-[0_0_20px_rgba(124,92,252,0.15)]'
          : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${meta.bg}`}>
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{angle.title}</p>
              {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
            </div>
            <span className={`inline-block text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full border mt-1 ${meta.bg} ${meta.color}`}>
              {angle.goal}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">{angle.strategy}</p>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-mono">Key message</p>
                <p className="text-xs text-foreground italic">&ldquo;{angle.keyMessage}&rdquo;</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-mono">Visual direction</p>
                <p className="text-xs text-muted-foreground">{angle.visualStyle}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-mono">Image prompt</p>
                <p className="text-xs text-foreground/70 font-mono bg-secondary/50 rounded p-2 leading-relaxed">{angle.imagePrompt}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {angle.platforms.map(p => (
                  <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground capitalize">{p}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function CampaignBriefPanel({ onGenerate }: Props) {
  const { campaignBrief, setCampaignBrief } = useAppStore();
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(
    campaignBrief?.campaignAngles[0]?.id ?? null,
  );
  const [userNotes, setUserNotes]         = useState('');
  const [showInsights, setShowInsights]   = useState(false);

  if (!campaignBrief) return null;

  const brief: CampaignBrief = campaignBrief;
  const selectedAngle = brief.campaignAngles.find(a => a.id === selectedAngleId);

  const handleGenerate = () => {
    if (!selectedAngle) return;
    const notes = userNotes.trim();
    const prompt = notes
      ? `${selectedAngle.imagePrompt}. Additional direction: ${notes}`
      : selectedAngle.imagePrompt;
    onGenerate(prompt, selectedAngle.title);
  };

  return (
    <div className="h-full overflow-y-auto pb-36">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a
                href={brief.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 font-mono"
                onClick={(e) => e.stopPropagation()}
              >
                {brief.url.replace(/^https?:\/\//, '').slice(0, 50)}
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{brief.industry}</span>
            </div>
            <h2 className="font-serif text-2xl font-bold text-foreground">Campaign Brief</h2>
            <p className="text-sm text-muted-foreground mt-1">{brief.businessSummary}</p>
          </div>
          <button
            type="button"
            onClick={() => setCampaignBrief(null)}
            className="text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Insights accordion */}
        <button
          type="button"
          onClick={() => setShowInsights(!showInsights)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors mb-6"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Business & Market Insights</span>
          </div>
          {showInsights ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {showInsights && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <InsightRow label="Audience"      value={brief.targetAudience} />
                <InsightRow label="Value prop"    value={brief.uniqueValueProp} />
                <InsightRow label="Market"        value={brief.industryInsights} />
                <InsightRow label="Platforms"     value={brief.recommendedPlatforms.join(', ')} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Questions / suggestions */}
        {brief.suggestedQuestions.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <p className="text-xs text-amber-400 uppercase tracking-wider font-mono mb-2">Consider answering these</p>
            <ul className="space-y-1">
              {brief.suggestedQuestions.map((q, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>{q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Campaign angles */}
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-3">Choose a campaign angle</p>
          <div className="space-y-3">
            {brief.campaignAngles.map(angle => (
              <AngleCard
                key={angle.id}
                angle={angle}
                selected={selectedAngleId === angle.id}
                onSelect={() => setSelectedAngleId(angle.id)}
              />
            ))}
          </div>
        </div>

        {/* User notes */}
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-2">Your direction (optional)</p>
          <textarea
            value={userNotes}
            onChange={e => setUserNotes(e.target.value)}
            placeholder="Add your own pointers — e.g. focus on B2B, mention our summer sale, use our brand colours, keep it minimal..."
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground/50 resize-none outline-none focus:border-primary/50 transition-colors"
            rows={3}
          />
        </div>
      </div>

      {/* Sticky generate bar */}
      <div className="fixed bottom-0 left-40 right-0 z-30 p-4 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <div className="flex items-center justify-between bg-card/95 backdrop-blur-md border border-border rounded-2xl px-5 py-3 shadow-lg">
            <div className="min-w-0 flex-1 mr-4">
              {selectedAngle ? (
                <p className="text-sm text-foreground font-medium truncate">
                  <span className="text-muted-foreground">Angle:</span> {selectedAngle.title}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Select a campaign angle above</p>
              )}
            </div>
            <Button
              onClick={handleGenerate}
              disabled={!selectedAngle}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-2 shrink-0"
            >
              Generate images · 18 cr
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
