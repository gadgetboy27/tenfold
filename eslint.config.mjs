import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Every route under app/api now authenticates through withWorkspace, which
  // is what makes the tenant filter automatic (docs/security-review-2026-09-16
  // §5.1). A route that reaches for getSession itself opts back out of that
  // guarantee, so the import is refused here rather than caught in review.
  // Webhooks, cron and public routes have no session and never needed it.
  {
    files: ["app/api/**/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth/session",
              message:
                "Authenticate with withWorkspace (lib/api/with-workspace) — it gives you session, a tenant-scoped db, and the rate limit.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
