'use client';

import { useState } from 'react';

interface ScheduleItem {
  platform: string;
  formatKey: string;
  content: string;
  scheduledAt: string;
}

interface ApproveAllProps {
  submissionId: string;
  schedule: ScheduleItem[];
}

interface ApproveResult {
  published?: unknown[];
  failed?: { platform: string; error: string }[];
}

export function ApproveAll({ submissionId, schedule }: ApproveAllProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [error, setError] = useState('');

  const handleApprove = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/content/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to publish');
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-900">✓ Content Published!</h3>
          <p className="text-green-800 text-sm mt-2">
            {result.published?.length || 0} posts scheduled across your platforms.
          </p>
        </div>

        {result.failed && result.failed.length > 0 && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-900">⚠ Some posts failed</h3>
            <ul className="text-yellow-800 text-sm mt-2 space-y-1">
              {result.failed.map((item, idx) => (
                <li key={idx}>{item.platform}: {item.error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-800 text-sm">
          Ready to schedule {schedule.length} posts across your connected platforms?
        </p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      <button
        onClick={handleApprove}
        disabled={loading || schedule.length === 0}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
      >
        {loading ? 'Publishing...' : `Publish All ${schedule.length} Posts`}
      </button>
    </div>
  );
}
