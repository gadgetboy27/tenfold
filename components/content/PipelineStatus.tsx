'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface StageResult {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  analyse: 'Analysing Content',
  repurpose: 'Generating Formats',
  schedule: 'Scheduling Posts',
  thumbnails: 'Creating Thumbnails',
  publish: 'Ready to Publish',
};

const STAGE_ORDER = ['analyse', 'repurpose', 'schedule', 'thumbnails', 'publish'];

interface PipelineStatusProps {
  submissionId: string;
}

export function PipelineStatus({ submissionId }: PipelineStatusProps) {
  const [stages, setStages] = useState<Map<string, StageResult>>(new Map());
  const [isComplete, setIsComplete] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const subscription = supabase
      .channel(`submission:${submissionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'content_pipeline_results',
          filter: `submission_id=eq.${submissionId}`,
        },
        (payload) => {
          const data = payload.new as any;
          setStages((prev) => {
            const next = new Map(prev);
            next.set(data.stage, {
              stage: data.stage,
              status: data.status,
              error: data.error,
            });
            return next;
          });
        },
      )
      .subscribe();

    fetch(`/api/content/${submissionId}/status`)
      .then((res) => {
        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        const readChunk = async () => {
          const { done, value } = await reader.read();
          if (done) return;

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.stages) {
                  const newStages = new Map<string, StageResult>();
                  for (const stage of data.stages) {
                    newStages.set(stage.stage, {
                      stage: stage.stage,
                      status: stage.status,
                      error: stage.error,
                    });
                  }
                  setStages(newStages);

                  const allDone = data.stages.every(
                    (s: any) => s.status === 'completed' || s.status === 'failed'
                  );
                  if (allDone) {
                    setIsComplete(true);
                  }
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }

          readChunk();
        };

        readChunk();
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [submissionId, supabase]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '⟳';
      default:
        return '○';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'running':
        return 'text-blue-600 animate-spin';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Pipeline Progress</h2>

      <div className="space-y-3">
        {STAGE_ORDER.map((stageKey) => {
          const stage = stages.get(stageKey);
          const status = stage?.status || 'pending';

          return (
            <div key={stageKey} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${getStatusColor(status)}`}>
                {getStatusIcon(status)}
              </div>
              <div className="flex-1">
                <p className="font-medium">{STAGE_LABELS[stageKey]}</p>
                {stage?.error && <p className="text-red-600 text-sm">{stage.error}</p>}
              </div>
              <span className="text-xs font-mono text-gray-500">{status}</span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">✓ Pipeline complete! Ready to review and publish.</p>
        </div>
      )}
    </div>
  );
}
