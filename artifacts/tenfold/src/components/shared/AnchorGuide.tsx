import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Music, FileText, Presentation, PenTool, X, Sparkles } from 'lucide-react';

interface Intent {
  icon: typeof Film;
  label: string;
  description: string;
  target: string;
  colour: string;
  glow: string;
}

const INTENTS: Intent[] = [
  {
    icon: Film,
    label: 'Make a video',
    description: 'Turn your image into a cinematic 10–60s clip',
    target: 'video',
    colour: '#A78BFA',
    glow: 'rgba(167,139,250,0.15)',
  },
  {
    icon: FileText,
    label: 'Write a caption',
    description: 'Platform-ready script or caption in seconds',
    target: 'script',
    colour: '#34D399',
    glow: 'rgba(52,211,153,0.15)',
  },
  {
    icon: Music,
    label: 'Add a soundtrack',
    description: 'A 30s background track that matches the mood',
    target: 'music',
    colour: '#F472B6',
    glow: 'rgba(244,114,182,0.15)',
  },
  {
    icon: Presentation,
    label: 'Build a slide deck',
    description: 'Generate a sequence of presentation-ready slides',
    target: 'slides',
    colour: '#38BDF8',
    glow: 'rgba(56,189,248,0.15)',
  },
  {
    icon: PenTool,
    label: 'Design a logo',
    description: 'Create brand logo concepts in multiple styles',
    target: 'logo',
    colour: '#FB923C',
    glow: 'rgba(251,146,60,0.15)',
  },
];

interface AnchorGuideProps {
  onDismiss: () => void;
}

export default function AnchorGuide({ onDismiss }: AnchorGuideProps) {
  const [leaving, setLeaving] = useState(false);

  const handleIntent = (target: string) => {
    setLeaving(true);
    setTimeout(() => {
      const card = document.querySelector(`[data-guide-id="${target}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('guide-flash');
        setTimeout(() => card.classList.remove('guide-flash'), 1200);
      }
      onDismiss();
    }, 220);
  };

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(onDismiss, 220);
  };

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 z-30 flex items-end justify-center pb-8 px-6"
          style={{ background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#00D4FF' }} />
                <span className="text-sm font-medium text-[#F0F0F0]" style={{ fontFamily: 'Syne, sans-serif' }}>
                  Anchor locked in — what do you want to create?
                </span>
              </div>
              <button
                onClick={handleDismiss}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#888] hover:text-[#F0F0F0] hover:bg-white/8 transition-all"
                data-testid="button-guide-dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 3 + 2 layout */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              {INTENTS.slice(0, 3).map((intent, i) => (
                <IntentCard key={intent.target} intent={intent} index={i} onClick={handleIntent} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INTENTS.slice(3).map((intent, i) => (
                <IntentCard key={intent.target} intent={intent} index={i + 3} onClick={handleIntent} />
              ))}
            </div>

            <div className="text-center mt-4">
              <button
                onClick={handleDismiss}
                className="text-xs text-[#444] hover:text-[#888] transition-colors"
                data-testid="button-guide-show-all"
              >
                Show me everything
              </button>
            </div>
          </div>

          <style>{`
            @keyframes guideFlash {
              0%   { box-shadow: 0 0 0 0 rgba(124,92,252,0); border-color: rgba(255,255,255,0.08); }
              30%  { box-shadow: 0 0 0 6px rgba(124,92,252,0.35); border-color: rgba(124,92,252,0.8); }
              70%  { box-shadow: 0 0 0 3px rgba(124,92,252,0.15); border-color: rgba(124,92,252,0.5); }
              100% { box-shadow: 0 0 0 0 rgba(124,92,252,0); border-color: rgba(255,255,255,0.08); }
            }
            .guide-flash { animation: guideFlash 1.2s ease forwards; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IntentCard({ intent, index, onClick }: { intent: Intent; index: number; onClick: (t: string) => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      onClick={() => onClick(intent.target)}
      data-testid={`button-intent-${intent.target}`}
      className="group relative text-left rounded-xl p-4 border transition-all duration-200 hover:scale-[1.02]"
      style={{ background: 'rgba(17,17,17,0.9)', borderColor: 'rgba(255,255,255,0.08)' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = intent.glow;
        (e.currentTarget as HTMLElement).style.borderColor = intent.colour + '55';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(17,17,17,0.9)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
      }}
    >
      <intent.icon className="w-5 h-5 mb-3 transition-transform group-hover:scale-110" style={{ color: intent.colour }} />
      <p className="text-sm font-medium text-[#F0F0F0] mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>{intent.label}</p>
      <p className="text-xs text-[#888] leading-relaxed">{intent.description}</p>
      <div className="absolute top-3 right-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: intent.colour }}>↗</div>
    </motion.button>
  );
}
