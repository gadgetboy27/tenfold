import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import ImageCard from '../shared/ImageCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function Step2Select() {
  const { generatedAssets, selectedAnchorId, completeStep, setStep } = useAppStore();

  useEffect(() => {
    if (generatedAssets.length > 0) {
      completeStep(1);
    }
  }, [generatedAssets, completeStep]);

  const handleConfirmAnchor = () => {
    if (selectedAnchorId) {
      completeStep(2);
      setStep(3);
    }
  };

  return (
    <div className="h-full flex flex-col relative pb-20">
      <div className="flex-1 overflow-y-auto pt-8 flex justify-center">
        <div className="w-full max-w-5xl px-6">
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h2 className="font-serif text-2xl font-bold text-foreground">Select your anchor</h2>
              <p className="text-muted-foreground text-sm mt-1">This image will be the foundation for your video, music, and social posts.</p>
            </div>
            
            {selectedAnchorId && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <Button 
                  onClick={handleConfirmAnchor}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  Use This Image →
                </Button>
              </motion.div>
            )}
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            {generatedAssets.map((asset, i) => (
              <ImageCard key={asset.id} asset={asset} index={i} />
            ))}
          </div>

          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i < generatedAssets.length ? 'bg-primary' : 'bg-secondary'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
