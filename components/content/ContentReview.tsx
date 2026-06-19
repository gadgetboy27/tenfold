'use client';

import { useEffect, useState } from 'react';
import type { ScheduleItem } from '@/lib/content-agent/types';

interface PipelineResult {
  stage: string;
  status: string;
  output_json?: {
    youtubeDescription?: string;
    linkedinPost?: string;
    twitterThread?: string[];
    instagramCaption?: string;
    tiktokScript?: string;
    emailNewsletter?: string;
  };
}

interface ContentReviewProps {
  submissionId: string;
  onScheduleChange?: (schedule: ScheduleItem[]) => void;
}

export function ContentReview({ submissionId, onScheduleChange }: ContentReviewProps) {
  const [results, setResults] = useState<PipelineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await fetch(`/api/content/${submissionId}/results`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.pipelineResults || []);

          if (onScheduleChange) {
            const scheduleStage = data.pipelineResults?.find((r: PipelineResult) => r.stage === 'schedule');
            if (scheduleStage?.output_json) {
              onScheduleChange(scheduleStage.output_json);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch results:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
    const interval = setInterval(fetchResults, 3000);
    return () => clearInterval(interval);
  }, [submissionId, onScheduleChange]);

  const repurposeResult = results.find((r) => r.stage === 'repurpose');
  const repurposeOutput = repurposeResult?.output_json;

  if (loading) {
    return <div className="text-center py-8">Loading content...</div>;
  }

  if (!repurposeOutput) {
    return <div className="text-center py-8 text-gray-500">Waiting for content generation...</div>;
  }

  const formats = [
    { key: 'youtubeDescription', label: 'YouTube Description', value: repurposeOutput.youtubeDescription },
    { key: 'linkedinPost', label: 'LinkedIn Post', value: repurposeOutput.linkedinPost },
    { key: 'twitterThread', label: 'Twitter Thread', value: (repurposeOutput.twitterThread || []).join('\n\n') },
    { key: 'instagramCaption', label: 'Instagram Caption', value: repurposeOutput.instagramCaption },
    { key: 'tiktokScript', label: 'TikTok Script', value: repurposeOutput.tiktokScript },
    { key: 'emailNewsletter', label: 'Email Newsletter', value: repurposeOutput.emailNewsletter },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Review Generated Content</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {formats.map((format) => (
          <div key={format.key} className="border rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-sm">{format.label}</h3>
            <textarea
              value={edits[format.key] || format.value || ''}
              onChange={(e) => setEdits((prev) => ({ ...prev, [format.key]: e.target.value }))}
              className="w-full h-40 p-2 border rounded font-mono text-xs resize-none"
            />
            <p className="text-xs text-gray-500">{(edits[format.key] || format.value || '').length} characters</p>
          </div>
        ))}
      </div>
    </div>
  );
}
