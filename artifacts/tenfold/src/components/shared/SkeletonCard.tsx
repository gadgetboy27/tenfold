import React from 'react';
import { motion } from 'framer-motion';

const ASPECT_CLASSES: Record<string, string> = {
  '1:1':  'aspect-square',
  '4:5':  'aspect-[4/5]',
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
};

interface SkeletonCardProps {
  delay?: number;
  aspectRatio?: string;
}

export default function SkeletonCard({ delay = 0, aspectRatio = '1:1' }: SkeletonCardProps) {
  const aspectClass = ASPECT_CLASSES[aspectRatio] ?? 'aspect-square';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: delay * 0.06 }}
      className={`relative ${aspectClass} rounded-xl bg-card border border-border overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent shimmer-animation" />
      <style>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        .shimmer-animation { transform: translateX(-100%); animation: shimmer 2s infinite; }
      `}</style>
    </motion.div>
  );
}
