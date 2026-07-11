import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  autofixAdjustmentSchema,
  type AutofixAdjustment,
  type AutofixLayer,
  type AutofixZone,
} from "@/lib/composition/autofix";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const responseSchema = z.object({
  adjustments: z.array(autofixAdjustmentSchema),
});

export interface AutofixInput {
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg";
  platformLabel: string;
  aspect: string;
  layers: AutofixLayer[];
  zones: AutofixZone[];
}

/**
 * Ask Claude vision to nudge a composition's layers so nothing sits under the
 * platform's UI chrome and the layout reads well — the Phase 6 polish pass. It
 * SEES the rendered format (with its safe-zone guides) and returns per-layer
 * adjustments in normalized coordinates via a forced tool call.
 */
export async function autofixLayout(
  input: AutofixInput,
): Promise<AutofixAdjustment[]> {
  const layerLines = input.layers
    .map(
      (l) =>
        `- id="${l.id}" ${l.kind}` +
        (l.text ? ` text="${l.text.replace(/\n/g, " ").slice(0, 60)}"` : "") +
        ` centre=(${l.nx.toFixed(2)},${l.ny.toFixed(2)})` +
        ` halfSize=(${l.hw.toFixed(2)},${l.hh.toFixed(2)})`,
    )
    .join("\n");
  const zoneLines = input.zones.length
    ? input.zones
        .map(
          (z) =>
            `- ${z.label}: x ${z.x.toFixed(2)}..${(z.x + z.w).toFixed(2)}, ` +
            `y ${z.y.toFixed(2)}..${(z.y + z.h).toFixed(2)}`,
        )
        .join("\n")
    : "(none)";

  const prompt = `You are a layout assistant for a social video composition rendered for ${input.platformLabel} (${input.aspect}).
The attached image is the current composition. Coordinates are fractions of the frame: (0,0) is top-left, (1,1) is bottom-right.

SAFE ZONES — regions the platform's own UI covers; keep important content OUT of them:
${zoneLines}

LAYERS (centre + half-size, as fractions):
${layerLines}

Propose the SMALLEST set of adjustments so no layer's box overlaps a safe zone and the composition reads well — balanced, not cramped, text fully on-frame. For each layer you move, give a new centre (nx, ny in 0..1). If a layer is too large, give a scale multiplier below 1 to shrink it (1 = unchanged). Only include layers that need changing; preserve the design's intent — don't relocate everything. Respond with the propose_layout tool.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [
      {
        name: "propose_layout",
        description:
          "Return per-layer layout adjustments in normalized (0..1) coordinates.",
        input_schema: {
          type: "object",
          properties: {
            adjustments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  layerId: { type: "string" },
                  nx: { type: "number", description: "new centre x, 0..1" },
                  ny: { type: "number", description: "new centre y, 0..1" },
                  scale: {
                    type: "number",
                    description:
                      "relative scale multiplier, e.g. 0.8 to shrink",
                  },
                },
                required: ["layerId"],
              },
            },
          },
          required: ["adjustments"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_layout" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("No layout proposal from Claude");
  }
  const parsed = responseSchema.safeParse(toolUse.input);
  if (!parsed.success) throw new Error("Invalid layout proposal");

  // Clamp normalized coordinates defensively.
  return parsed.data.adjustments.map((a) => ({
    ...a,
    nx: a.nx !== undefined ? Math.min(1, Math.max(0, a.nx)) : undefined,
    ny: a.ny !== undefined ? Math.min(1, Math.max(0, a.ny)) : undefined,
  }));
}
