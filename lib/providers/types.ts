/**
 * The provider-abstraction seam PRODUCT_STRATEGY.md §4 asked for: swap which
 * inference provider handles a submission with a config change in
 * lib/providers/router.ts, not a rewrite of lib/fal/queue.ts or its ~17
 * callers — they only ever see enqueueJob/enqueueWithFallback/enqueueFirstOf,
 * and none of those signatures change.
 *
 * Scope, stated plainly rather than oversold: this abstracts SUBMISSION
 * only. Webhook ingestion is NOT abstracted — every caller still hardcodes
 * `${APP_URL}/api/webhooks/fal?j=${jobId}` as its webhookUrl, and that route
 * parses fal's own payload shape. A real second provider would need its own
 * webhook route and payload parser; this interface doesn't paper over that.
 */
export interface ProviderAdapter {
  id: string;
  /** Submit one job to this provider's queue. Mirrors fal's own submit
   *  contract (endpoint id / input record / webhook URL) since fal is the
   *  only provider implemented today — a future adapter adapts its own
   *  SDK's shape to this, not the other way round. */
  submit(
    endpoint: string,
    input: Record<string, unknown>,
    webhookUrl: string,
  ): Promise<{ requestId: string }>;
}
