import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wand2, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

export interface PromptAnalysis {
  score: number;
  ready: boolean;
  dimensions: {
    subject: number;
    setting: number;
    style: number;
    mood: number;
    lighting: number;
  };
  missing: string[];
  questions: string[];
  enhanced: string;
}

interface PromptCoachProps {
  analysis: PromptAnalysis;
  onEnhance: (enhanced: string) => void;
  onDismiss: () => void;
}

const DIMENSION_LABELS: Record<string, string> = {
  subject: 'Subject',
  setting: 'Setting',
  style: 'Style',
  mood: 'Mood',
  lighting: 'Lighting',
};

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 70 ? '#22C55E' : score >= 45 ? '#F59E0B' : '#EF4444';
  const label = score >= 70 ? 'Strong' : score >= 45 ? 'Fair' : 'Weak';

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - filled}
            style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color, fontFamily: 'Syne, sans-serif' }}>{score}</span>
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

function DimensionPill({ label, score }: { label: string; score: number }) {
  const present = score >= 60;
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${
      present
        ? 'bg-green-500/10 border-green-500/25 text-green-400'
        : 'bg-red-500/8 border-red-500/20 text-[#666]'
    }`}>
      {present
        ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
        : <AlertCircle className="w-2.5 h-2.5 shrink-0" />
      }
      {label}
    </div>
  );
}

export default function PromptCoach({ analysis, onEnhance, onDismiss }: PromptCoachProps) {
  const { score, dimensions, questions, enhanced, missing } = analysis;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="mt-2 rounded-xl border overflow-hidden"
        style={{
          background: 'rgba(14,14,14,0.95)',
          borderColor: score >= 70 ? 'rgba(34,197,94,0.25)' : score >= 45 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.20)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 flex-1">
            <Wand2 className="w-3.5 h-3.5" style={{ color: '#7C5CFC' }} />
            <span className="text-xs font-semibold text-[#CCC]" style={{ fontFamily: 'Syne, sans-serif' }}>
              Prompt Coach
            </span>
            <span className="text-[9px] text-[#555] font-mono">— {score < 60 ? 'needs more detail' : score < 80 ? 'getting there' : 'ready to generate'}</span>
          </div>
          <button
            onClick={onDismiss}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[#555] hover:text-[#AAA] transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-4 p-4">
          <ScoreRing score={score} />

          <div className="flex-1 min-w-0 space-y-3">
            {/* Dimension pills */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(dimensions).map(([key, val]) => (
                <DimensionPill key={key} label={DIMENSION_LABELS[key] ?? key} score={val} />
              ))}
            </div>

            {/* Questions */}
            {questions.length > 0 && (
              <div className="space-y-1.5">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <HelpCircle className="w-3 h-3 text-[#7C5CFC] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#888] leading-relaxed">{q}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Enhance CTA */}
        {missing.length > 0 && enhanced !== analysis.questions[0] && (
          <div className="px-4 pb-3">
            <button
              onClick={() => onEnhance(enhanced)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'rgba(124,92,252,0.12)',
                border: '1px solid rgba(124,92,252,0.3)',
                color: '#9D84FD',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,92,252,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,92,252,0.12)'; }}
            >
              <Wand2 className="w-3 h-3" />
              Enhance for me — add {missing.slice(0, 2).join(' & ').toLowerCase()}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
