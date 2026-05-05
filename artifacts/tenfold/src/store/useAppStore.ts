import { create } from 'zustand';

export interface Asset {
  id: string;
  url: string;
  prompt: string;
  aspectRatio?: string;
  style?: string;
  seed?: number;
  model?: string;
  createdAt: string;
}

export interface Expansion {
  id: string;
  status: 'generating' | 'ready' | 'failed';
  type: 'video' | 'music' | 'script';
  url?: string;
  content?: string;
  createdAt: string;
}

type Expansions = { video?: Expansion; music?: Expansion; script?: Expansion };

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
  aspectRatio: string;
  style: string;

  setStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setCampaignId: (id: string) => void;
  setCompositionId: (id: string) => void;
  setCreditBalance: (n: number) => void;
  setWorkspaceSlug: (slug: string) => void;
  setCampaignName: (name: string) => void;
  setAnchorId: (id: string | null) => void;
  setGeneratedAssets: (assets: Asset[]) => void;
  updateExpansion: (type: keyof Expansions, expansion: Expansion) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setAspectRatio: (r: string) => void;
  setStyle: (s: string) => void;
  completeStep: (step: number) => void;
  resetCampaign: () => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  currentCampaignId: null,
  currentCompositionId: null,
  currentStep: 1,
  completedSteps: new Set<number>(),
  creditBalance: 0,
  workspaceSlug: '',
  campaignName: 'Untitled Campaign',
  selectedAnchorId: null,
  generatedAssets: [],
  expansions: {},
  isGenerating: false,
  aspectRatio: '1:1',
  style: 'Photorealistic',

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
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  setStyle: (s) => set({ style: s }),
  completeStep: (step) =>
    set((state) => {
      const newCompleted = new Set(state.completedSteps);
      newCompleted.add(step);
      return { completedSteps: newCompleted };
    }),
  resetCampaign: () =>
    set({
      currentCampaignId: null,
      currentCompositionId: null,
      currentStep: 1,
      completedSteps: new Set<number>(),
      campaignName: 'Untitled Campaign',
      selectedAnchorId: null,
      generatedAssets: [],
      expansions: {},
      isGenerating: false,
    }),
}));
