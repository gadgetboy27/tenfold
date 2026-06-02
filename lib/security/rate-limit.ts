// Simple in-memory rate limiter (use Redis in production)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function getRateLimitKey(request: Request): string {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  return ip;
}

export function checkRateLimit(key: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const bucket = requestCounts.get(key);

  if (!bucket || now > bucket.resetAt) {
    requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count++;
  return true;
}

export function cleanupRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of requestCounts.entries()) {
    if (now > bucket.resetAt) {
      requestCounts.delete(key);
    }
  }
}

// Cleanup old buckets every minute
if (typeof globalThis !== 'undefined') {
  setInterval(() => cleanupRateLimitBuckets(), 60000);
}
