"use client";

import { create } from "zustand";
import type { CampaignBrief } from "@/lib/claude/campaign-brief";
import { generateCampaignName } from "@/lib/names/generator";

export interface Asset {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  style: string;
  createdAt: string;
  /** Creative-direction label for the anchor set, e.g. "Wide", "Close-up". */
  direction?: string;
}

export interface Expansion {
  jobId?: string;
  status: "idle" | "pending" | "ready" | "failed";
  content?: string;
  url?: string;
  urls?: string[];
  error?: string;
  elapsed?: number;
}

type Expansions = { video?: Expansion; music?: Expansion; script?: Expansion };

// Draft inputs for the Expand step + its panels. Held in the store (not local
// component state) so they SURVIVE navigating away to Compose and back — users
// must not lose prompts they typed.
export interface ExpandDrafts {
  videoDuration: 10 | 30 | 60;
  videoStyle: string;
  musicGenre: string;
  musicModel: string;
  scriptPlatform: string;
  scriptTone: string;
  variationDirection: Record<string, string>;
}
export interface TalkingDraft {
  source: "upload" | "generate" | "stock";
  presenterUrl: string;
  voice: string;
  resolution: "480p" | "720p";
  tone: "professional" | "casual" | "playful";
  seconds: number;
  language: string;
  name: string;
  description: string;
  featuresText: string;
  cta: string;
  script: string;
}
export interface TryonDraft {
  modelUrl: string;
  garmentUrl: string;
  category: "auto" | "tops" | "bottoms" | "one-pieces";
}

const DEFAULT_EXPAND_DRAFTS: ExpandDrafts = {
  videoDuration: 10,
  videoStyle: "Cinematic",
  musicGenre: "Lo-fi Chill",
  musicModel: "stable-audio",
  scriptPlatform: "IG",
  scriptTone: "Pro",
  variationDirection: { video: "", music: "", script: "" },
};
const DEFAULT_TALKING_DRAFT: TalkingDraft = {
  source: "upload",
  presenterUrl: "",
  voice: "Rachel",
  resolution: "480p",
  tone: "professional",
  seconds: 15,
  language: "en",
  name: "",
  description: "",
  featuresText: "",
  cta: "",
  script: "",
};
const DEFAULT_TRYON_DRAFT: TryonDraft = {
  modelUrl: "",
  garmentUrl: "",
  category: "auto",
};
export interface AutoCaptionDraft {
  source: "spoken" | "url";
  videoUrl: string;
  color: "white" | "yellow" | "black";
  fontSize: number;
  position: "bottom" | "middle";
  upper: boolean;
}
const DEFAULT_AUTO_CAPTION_DRAFT: AutoCaptionDraft = {
  source: "spoken",
  videoUrl: "",
  color: "white",
  fontSize: 28,
  position: "bottom",
  upper: false,
};
export interface ABVariantsDraft {
  topic: string;
  platform: string;
  tone: "professional" | "casual" | "playful";
  count: number;
}
const DEFAULT_AB_VARIANTS_DRAFT: ABVariantsDraft = {
  topic: "",
  platform: "instagram",
  tone: "professional",
  count: 5,
};

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
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  completedSteps: Set<number>;
  creditBalance: number;
  workspaceSlug: string;
  campaignName: string;
  selectedAnchorId: string | null;
  generatedAssets: Asset[];
  expansions: Expansions;
  /** Draft inputs that persist across step navigation (Compose ↔ Expand). */
  expandDrafts: ExpandDrafts;
  talkingDraft: TalkingDraft;
  tryonDraft: TryonDraft;
  autoCaptionDraft: AutoCaptionDraft;
  abVariantsDraft: ABVariantsDraft;
  /** Last spoken-video result URL — offered as a source for auto-captions. */
  lastSpokenVideoUrl: string;
  /** Global UI preference: show inline help tooltips. */
  tooltipsEnabled: boolean;
  /** AI-tailored caption per platform (e.g. { instagram, tiktok, linkedin }). */
  platformCaptions: Record<string, string>;
  isGenerating: boolean;
  generationStage: string;
  generationElapsed: number;
  aspectRatio: string;
  style: string;
  campaignBrief: CampaignBrief | null;
  pendingBriefPrompt: string | null;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;

  setStep: (step: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setCampaignId: (id: string) => void;
  setCompositionId: (id: string) => void;
  setCreditBalance: (n: number) => void;
  setWorkspaceSlug: (slug: string) => void;
  setCampaignName: (name: string) => void;
  setAnchorId: (id: string | null) => void;
  setGeneratedAssets: (assets: Asset[]) => void;
  setPlatformCaptions: (captions: Record<string, string>) => void;
  updateExpansion: (
    type: keyof Expansions,
    expansion: Partial<Expansion>,
  ) => void;
  patchExpandDrafts: (patch: Partial<ExpandDrafts>) => void;
  patchTalkingDraft: (patch: Partial<TalkingDraft>) => void;
  patchTryonDraft: (patch: Partial<TryonDraft>) => void;
  patchAutoCaptionDraft: (patch: Partial<AutoCaptionDraft>) => void;
  patchABVariantsDraft: (patch: Partial<ABVariantsDraft>) => void;
  setLastSpokenVideoUrl: (url: string) => void;
  setTooltipsEnabled: (v: boolean) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationStage: (stage: string, elapsed: number) => void;
  setAspectRatio: (r: string) => void;
  setStyle: (s: string) => void;
  completeStep: (step: number) => void;
  setCampaignBrief: (brief: CampaignBrief | null) => void;
  setPendingBriefPrompt: (prompt: string | null) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  loadCampaign: (campaign: CampaignResume) => void;
  resetCampaign: () => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  currentCampaignId: null,
  currentCompositionId: null,
  currentStep: 1,
  completedSteps: new Set<number>(),
  creditBalance: 0,
  workspaceSlug: "",
  campaignName: generateCampaignName(),
  selectedAnchorId: null,
  generatedAssets: [],
  expansions: {},
  expandDrafts: DEFAULT_EXPAND_DRAFTS,
  talkingDraft: DEFAULT_TALKING_DRAFT,
  tryonDraft: DEFAULT_TRYON_DRAFT,
  autoCaptionDraft: DEFAULT_AUTO_CAPTION_DRAFT,
  abVariantsDraft: DEFAULT_AB_VARIANTS_DRAFT,
  lastSpokenVideoUrl: "",
  tooltipsEnabled: true,
  platformCaptions: {},
  isGenerating: false,
  generationStage: "",
  generationElapsed: 0,
  aspectRatio: "1:1",
  style: "Photorealistic",
  campaignBrief: null,
  pendingBriefPrompt: null,
  leftDrawerOpen: false,
  rightDrawerOpen: false,

  setStep: (step) => set({ currentStep: step }),
  setCampaignId: (id) => set({ currentCampaignId: id }),
  setCompositionId: (id) => set({ currentCompositionId: id }),
  setCreditBalance: (n) => set({ creditBalance: n }),
  setWorkspaceSlug: (slug) => set({ workspaceSlug: slug }),
  setCampaignName: (name) => set({ campaignName: name }),
  setAnchorId: (id) => set({ selectedAnchorId: id }),
  setGeneratedAssets: (assets) => set({ generatedAssets: assets }),
  setPlatformCaptions: (captions) => set({ platformCaptions: captions }),
  updateExpansion: (type, expansion) =>
    set((state) => ({
      expansions: {
        ...state.expansions,
        [type]: { ...state.expansions[type], ...expansion } as Expansion,
      },
    })),
  patchExpandDrafts: (patch) =>
    set((state) => ({ expandDrafts: { ...state.expandDrafts, ...patch } })),
  patchTalkingDraft: (patch) =>
    set((state) => ({ talkingDraft: { ...state.talkingDraft, ...patch } })),
  patchTryonDraft: (patch) =>
    set((state) => ({ tryonDraft: { ...state.tryonDraft, ...patch } })),
  patchAutoCaptionDraft: (patch) =>
    set((state) => ({
      autoCaptionDraft: { ...state.autoCaptionDraft, ...patch },
    })),
  patchABVariantsDraft: (patch) =>
    set((state) => ({
      abVariantsDraft: { ...state.abVariantsDraft, ...patch },
    })),
  setLastSpokenVideoUrl: (url) => set({ lastSpokenVideoUrl: url }),
  setTooltipsEnabled: (v) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tf_tooltips", v ? "on" : "off");
    }
    set({ tooltipsEnabled: v });
  },
  setIsGenerating: (v) =>
    set({ isGenerating: v, generationStage: "", generationElapsed: 0 }),
  setGenerationStage: (stage, elapsed) =>
    set({ generationStage: stage, generationElapsed: elapsed }),
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
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
  loadCampaign: (campaign) =>
    set({
      currentCampaignId: campaign.id,
      currentCompositionId: campaign.compositionId ?? null,
      currentStep: Math.min(6, Math.max(1, campaign.current_step)) as
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6,
      completedSteps: new Set(
        Array.from({ length: campaign.current_step - 1 }, (_, i) => i + 1),
      ),
      campaignName: campaign.name,
      selectedAnchorId: campaign.anchor_asset_id,
      generatedAssets: campaign.imageAssets,
      expansions: campaign.expansion_data ?? {},
      expandDrafts: DEFAULT_EXPAND_DRAFTS,
      talkingDraft: DEFAULT_TALKING_DRAFT,
      tryonDraft: DEFAULT_TRYON_DRAFT,
      autoCaptionDraft: DEFAULT_AUTO_CAPTION_DRAFT,
      abVariantsDraft: DEFAULT_AB_VARIANTS_DRAFT,
      lastSpokenVideoUrl: "",
      isGenerating: false,
      generationStage: "",
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
      expandDrafts: DEFAULT_EXPAND_DRAFTS,
      talkingDraft: DEFAULT_TALKING_DRAFT,
      tryonDraft: DEFAULT_TRYON_DRAFT,
      autoCaptionDraft: DEFAULT_AUTO_CAPTION_DRAFT,
      abVariantsDraft: DEFAULT_AB_VARIANTS_DRAFT,
      lastSpokenVideoUrl: "",
      platformCaptions: {},
      isGenerating: false,
      generationStage: "",
      generationElapsed: 0,
      campaignBrief: null,
      pendingBriefPrompt: null,
      leftDrawerOpen: false,
      rightDrawerOpen: false,
    }),
}));
