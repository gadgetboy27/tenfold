'use client';

import { create } from 'zustand';
import type { CampaignBrief } from '@/lib/claude/campaign-brief';
import { generateCampaignName } from '@/lib/names/generator';

export interface Asset {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  style: string;
  createdAt: string;
}

export interface Expansion {
  jobId?: string;
  status: 'idle' | 'pending' | 'ready' | 'failed';
  content?: string;
  url?: string;
  error?: string;
  elapsed?: number;
}

type Expansions = { video?: Expansion; music?: Expansion; script?: Expansion };

export interface CampaignResume {
  id: string;
  name: string;
  current_step: number;
  anchor_asset_id: string | null;
  expansion_data: Expansions;
  imageAssets: Asset[];
  compositionId?: string | null;
}

interface AppStore {
  currentCampaignId: string | null;
  currentCompositionId: string | null;
  currentStep: 1 | 2 | 3 | 4 | 5;
  completedSteps: Set<number>;
  creditBalance: number;
  workspaceSlug: string;
  campaignName: string;
  selectedAnchorId: string | null;
  generatedAssets: Asset[];
  expansions: Expansions;
  isGenerating: boolean;
  generationStage: string;
  generationElapsed: number;
  aspectRatio: string;
  style: string;
  campaignBrief: CampaignBrief | null;
  pendingBriefPrompt: string | null;

  setStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setCampaignId: (id: string) => void;
  setCompositionId: (id: string) => void;
  setCreditBalance: (n: number) => void;
  setWorkspaceSlug: (slug: string) => void;
  setCampaignName: (name: string) => void;
  setAnchorId: (id: string | null) => void;
  setGeneratedAssets: (assets: Asset[]) => void;
  updateExpansion: (type: keyof Expansions, expansion: Expansion) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationStage: (stage: string, elapsed: number) => void;
  setAspectRatio: (r: string) => void;
  setStyle: (s: string) => void;
  completeStep: (step: number) => void;
  setCampaignBrief: (brief: CampaignBrief | null) => void;
  setPendingBriefPrompt: (prompt: string | null) => void;
  loadCampaign: (campaign: CampaignResume) => void;
  resetCampaign: () => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  currentCampaignId: null,
  currentCompositionId: null,
  currentStep: 1,
  completedSteps: new Set<number>(),
  creditBalance: 0,
  workspaceSlug: '',
  campaignName: generateCampaignName(),
  selectedAnchorId: null,
  generatedAssets: [],
  expansions: {},
  isGenerating: false,
  generationStage: '',
  generationElapsed: 0,
  aspectRatio: '1:1',
  style: 'Photorealistic',
  campaignBrief: null,
  pendingBriefPrompt: null,

  setStep: (step) => set({ currentStep: step }),
  setCampaignId: (id) => set({ currentCampaignId: id }),
  setCompositionId: (id) => set({ currentCompositionId: id }),
  setCreditBalance: (n) => set({ creditBalance: n }),
  setWorkspaceSlug: (slug) => set({ workspaceSlug: slug }),
  setCampaignName: (name) => set({ campaignName: name }),
  setAnchorId: (id) => set({ selectedAnchorId: id }),
  setGeneratedAssets: (assets) => set({ generatedAssets: assets }),
  updateExpansion: (type, expansion) =>
    set((state) => ({ expansions: { ...state.expansions, [type]: expansion } })),
  setIsGenerating: (v) => set({ isGenerating: v, generationStage: '', generationElapsed: 0 }),
  setGenerationStage: (stage, elapsed) => set({ generationStage: stage, generationElapsed: elapsed }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  setStyle: (s) => set({ style: s }),
  completeStep: (step) =>
    set((state) => {
      const next = new Set(state.completedSteps);
      next.add(step);
      return { completedSteps: next };
    }),
  setCampaignBrief: (brief) => set({ campaignBrief: brief }),
  setPendingBriefPrompt: (prompt) => set({ pendingBriefPrompt: prompt }),
  loadCampaign: (campaign) =>
    set({
      currentCampaignId: campaign.id,
      currentCompositionId: campaign.compositionId ?? null,
      currentStep: Math.min(5, Math.max(1, campaign.current_step)) as 1 | 2 | 3 | 4 | 5,
      completedSteps: new Set(
        Array.from({ length: campaign.current_step - 1 }, (_, i) => i + 1),
      ),
      campaignName: campaign.name,
      selectedAnchorId: campaign.anchor_asset_id,
      generatedAssets: campaign.imageAssets,
      expansions: campaign.expansion_data ?? {},
      isGenerating: false,
      generationStage: '',
      generationElapsed: 0,
    }),
  resetCampaign: () =>
    set({
      currentCampaignId: null,
      currentCompositionId: null,
      currentStep: 1,
      completedSteps: new Set<number>(),
      campaignName: generateCampaignName(),
      selectedAnchorId: null,
      generatedAssets: [],
      expansions: {},
      isGenerating: false,
      generationStage: '',
      generationElapsed: 0,
      campaignBrief: null,
      pendingBriefPrompt: null,
    }),
}));
