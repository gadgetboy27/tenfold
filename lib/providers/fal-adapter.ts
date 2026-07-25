import { fal } from "@/lib/fal/client";
import type { ProviderAdapter } from "./types";

type Submit = (
  endpointId: string,
  opts: { input: unknown; webhookUrl: string },
) => Promise<{ request_id: string }>;

/** The only real provider today. This is exactly the submit logic
 *  lib/fal/queue.ts had inline before the router existed — moved, not
 *  rewritten. */
export const falAdapter: ProviderAdapter = {
  id: "fal",
  async submit(endpoint, input, webhookUrl) {
    try {
      const result = await (fal.queue.submit as Submit)(endpoint, {
        input,
        webhookUrl,
      });
      return { requestId: result.request_id };
    } catch (err) {
      // The fal client throws a bare "Unexpected status code: 422" and hides the
      // validation detail on `.body`. Surface it so job.error_message tells us
      // WHAT fal rejected instead of just the status.
      const e = err as { status?: number; body?: unknown; message?: string };
      let detail = "";
      try {
        detail =
          typeof e.body === "string"
            ? e.body
            : e.body
              ? JSON.stringify(e.body)
              : "";
      } catch {
        /* body wasn't serialisable */
      }
      throw new Error(
        [
          `fal ${endpoint}`,
          e.status ? `HTTP ${e.status}` : "",
          detail || e.message,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 600),
      );
    }
  },
};
