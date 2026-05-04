import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: delay * 0.06 }}
      className="relative aspect-square rounded-xl bg-card border border-border overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent shimmer-animation" />
      <style>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        .shimmer-animation {
          transform: translateX(-100%);
          animation: shimmer 2s infinite;
        }
      `}</style>
    </motion.div>
  );
}
