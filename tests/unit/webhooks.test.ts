import { describe, it, expect } from 'vitest';
import { falWebhookPayloadSchema } from '@/lib/fal/webhooks';

describe('falWebhookPayloadSchema', () => {
  it('parses a valid OK payload', () => {
    const raw = {
      request_id: 'req-abc123',
      status: 'OK',
      payload: {
        images: [{ url: 'https://example.com/img.jpg', width: 1024, height: 1024 }],
      },
    };
    const result = falWebhookPayloadSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('parses a valid ERROR payload', () => {
    const raw = { request_id: 'req-xyz', status: 'ERROR', error: 'Out of memory' };
    const result = falWebhookPayloadSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('ERROR');
  });

  it('rejects a payload without request_id', () => {
    const raw = { status: 'OK', payload: {} };
    const result = falWebhookPayloadSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts any status value (validation happens at handler level)', () => {
    const raw = { request_id: 'req-1', status: 'PENDING' };
    const result = falWebhookPayloadSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('PENDING');
  });
});
