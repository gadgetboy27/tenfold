import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BottomInputBar() {
  const [prompt, setPrompt] = useState('');
  const { creditBalance, setCreditBalance, setIsGenerating, setGeneratedAssets } = useAppStore();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (creditBalance < 18) {
      toast.error('Insufficient credits. Need 18 cr.');
      return;
    }

    setCreditBalance(creditBalance - 18);
    setIsGenerating(true);
    
    // Simulate generation delay
    setTimeout(() => {
      // Mock assets
      const newAssets = Array.from({ length: 6 }).map((_, i) => ({
        id: `asset-${Date.now()}-${i}`,
        url: `https://picsum.photos/seed/${Date.now() + i}/800/800`,
        prompt,
        createdAt: new Date().toISOString()
      }));
      setGeneratedAssets(newAssets);
      setIsGenerating(false);
      toast.success('Generated 6 assets');
    }, 3000);
  };

  return (
    <div className="h-20 bg-background border-t border-border px-6 flex items-center shrink-0 z-20">
      <form onSubmit={handleGenerate} className="w-full flex gap-4">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A confident founder presenting at a tech conference, golden hour lighting, professional, aspirational..."
          className="flex-1 h-12 bg-card border-border rounded-lg text-base"
          data-testid="input-prompt"
        />
        <Button 
          type="submit" 
          disabled={!prompt.trim()}
          className="h-12 px-6 bg-gradient-to-r from-primary to-[#9D84FD] hover:from-primary/90 hover:to-[#9D84FD]/90 text-white font-medium rounded-lg shadow-lg shadow-primary/20 w-40"
          data-testid="button-generate"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Generate · 18 cr
        </Button>
      </form>
    </div>
  );
}
