export type PipelineTone = 'professional' | 'casual' | 'educational' | 'entertaining';
export type PipelineStage = 'analyse' | 'repurpose' | 'schedule' | 'thumbnails' | 'publish';
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisOutput {
  mainTopic: string;
  keyInsights: string[];
  targetAudience: string;
  tone: PipelineTone;
  hooks: string[];
}

export interface RepurposeOutput {
  youtubeDescription: string;
  linkedinPost: string;
  twitterThread: string[];
  instagramCaption: string;
  tiktokScript: string;
  emailNewsletter: string;
}

export interface ScheduleItem {
  platform: string;
  formatKey: string;
  content: string;
  scheduledAt: string;
}

export interface ThumbnailConcept {
  hookText: string;
  textOverlayCopy: string;
  jobId: string;
  falRequestId?: string;
}

export interface ThumbnailsOutput {
  campaignId: string;
  concepts: ThumbnailConcept[];
}

export interface PublishItem {
  platform: string;
  scheduledAt: string;
  ayrsharePostId?: string;
  publishRecordId?: string;
  error?: string;
}

export interface PublishOutput {
  published: PublishItem[];
  failed: PublishItem[];
}

export interface AnalyticsReport {
  topPerformer: {
    postId: string;
    platform: string;
    reason: string;
  };
  worstPerformer: {
    postId: string;
    platform: string;
    reason: string;
  };
  topicIdeas: string[];
  summary: string;
}

export interface PipelineStageRow {
  id: string;
  submissionId: string;
  stage: PipelineStage;
  status: StageStatus;
  outputJson: unknown | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
