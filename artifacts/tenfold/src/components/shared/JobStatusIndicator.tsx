import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function JobStatusIndicator() {
  const { isGenerating, expansions } = useAppStore();
  
  const activeExpansions = Object.entries(expansions)
    .filter(([_, exp]) => exp?.status === 'generating');

  const hasActiveJobs = isGenerating || activeExpansions.length > 0;

  if (!hasActiveJobs) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-secondary transition-colors" data-testid="job-status-trigger">
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2.5 h-2.5 bg-primary rounded-full"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 bg-card border-border p-4 shadow-xl">
        <h4 className="text-sm font-medium mb-3 text-foreground flex items-center gap-2">
          <PlayCircle className="w-4 h-4 text-primary" /> Active Jobs
        </h4>
        <div className="space-y-4">
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-foreground">Generating Images</span>
                <span className="text-muted-foreground animate-pulse">Running...</span>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-primary/30" />
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3, ease: "linear" }}
                />
              </div>
            </div>
          )}
          
          {activeExpansions.map(([type, exp]) => (
            <div key={type} className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-foreground capitalize">Generating {type}</span>
                <span className="text-muted-foreground animate-pulse">Running...</span>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-primary/30" />
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3, ease: "linear" }}
                />
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
