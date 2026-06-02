'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ContentSubmit() {
  const router = useRouter();
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/content/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit content');
      }

      const { submissionId } = await res.json();
      router.push(`/content/${submissionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setTranscript(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="transcript" className="block text-sm font-medium">
          Paste your transcript or upload a file
        </label>
        <textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste video transcript, article, or any content here (min 50 characters)..."
          className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
          required
          minLength={50}
        />
        <input
          type="file"
          accept=".txt,.vtt,.srt"
          onChange={handleFileUpload}
          className="block text-sm"
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading || transcript.length < 50}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Analyzing...' : 'Submit for Analysis'}
      </button>
    </form>
  );
}
