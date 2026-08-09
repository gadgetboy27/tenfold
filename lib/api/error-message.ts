/**
 * Turns a thrown value into something a person can act on.
 *
 * Routes that call `schema.parse()` throw a ZodError whose `.message` is the
 * JSON-stringified issue array. The usual catch —
 *
 *     const msg = err instanceof Error ? err.message : "Unknown error";
 *     return NextResponse.json({ error: msg }, { status });
 *
 * — is technically correct and passes that JSON straight to the UI, where the
 * user sees:
 *
 *     [ { "origin": "string", "code": "too_big", "maximum": 200, "inclusive":
 *     true, "path": [ "product", "features", 2 ], … } ]
 *
 * which tells them nothing about which box to edit. This renders the same
 * information as a sentence naming the field and the limit.
 */

interface ZodLikeIssue {
  path?: (string | number)[];
  message?: string;
  code?: string;
  maximum?: number;
  minimum?: number;
}

/** Zod isn't imported here — this stays dependency-free and duck-types. */
function zodIssues(err: unknown): ZodLikeIssue[] | null {
  if (!err || typeof err !== "object") return null;
  const issues = (err as { issues?: unknown }).issues;
  return Array.isArray(issues) && issues.length > 0
    ? (issues as ZodLikeIssue[])
    : null;
}

/** "product.features[2]" — the shape a user can map back to a form field. */
function fieldName(path: (string | number)[] = []): string {
  if (path.length === 0) return "value";
  return path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    return acc ? `${acc}.${seg}` : seg;
  }, "");
}

function describe(issue: ZodLikeIssue): string {
  const field = fieldName(issue.path);
  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    return `${field} is too long (max ${issue.maximum} characters)`;
  }
  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    return `${field} is too short (min ${issue.minimum})`;
  }
  if (issue.code === "invalid_type") return `${field} is missing or invalid`;
  return `${field}: ${issue.message ?? "invalid"}`;
}

/**
 * A readable message for any thrown value. Caps at three issues — listing
 * twelve is as unhelpful as listing none.
 */
export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  const issues = zodIssues(err);
  if (issues) {
    const shown = issues.slice(0, 3).map(describe);
    const extra = issues.length - shown.length;
    return shown.join("; ") + (extra > 0 ? ` (and ${extra} more)` : "");
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
