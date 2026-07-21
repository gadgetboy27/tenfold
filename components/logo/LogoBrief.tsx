"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  LOGO_TYPES,
  COLOR_DIRECTIONS,
  LOGO_STYLES,
  type LogoBrief as LogoBriefType,
  type LogoType,
  type ColorDirection,
  type LogoStyleId,
} from "@/lib/logo/brief";

// Step 1 of the studio: the brief. Every field is skippable — only the business
// name is required (the schema's one non-defaulted field). Sliders and choices
// all start at neutral so a user can type a name and hit Generate in seconds.

const AXES: {
  key: keyof LogoBriefType["personality"];
  left: string;
  right: string;
}[] = [
  { key: "classicModern", left: "Classic", right: "Modern" },
  { key: "playfulSerious", left: "Playful", right: "Serious" },
  { key: "minimalDetailed", left: "Minimal", right: "Detailed" },
  { key: "warmCool", left: "Warm", right: "Cool" },
];

const TYPE_LABELS: Record<LogoType, string> = {
  wordmark: "Wordmark",
  icon: "Icon",
  combination: "Icon + text",
  emblem: "Emblem",
};

const COLOR_LABELS: Record<ColorDirection, string> = {
  auto: "Let AI choose",
  brand: "Brand colours",
  monochrome: "Monochrome",
  bold: "Bold",
  earthy: "Earthy",
  pastel: "Pastel",
  vibrant: "Vibrant",
};

interface LogoBriefProps {
  onSubmit: (brief: LogoBriefType) => void;
  submitting: boolean;
}

export function LogoBrief({ onSubmit, submitting }: LogoBriefProps) {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [logoType, setLogoType] = useState<LogoType>("combination");
  const [style, setStyle] = useState<LogoStyleId>("auto");
  const [colorDirection, setColorDirection] = useState<ColorDirection>("auto");
  const [notes, setNotes] = useState("");
  const [personality, setPersonality] = useState({
    classicModern: 50,
    playfulSerious: 50,
    minimalDetailed: 50,
    warmCool: 50,
  });

  const canSubmit = businessName.trim().length > 0 && !submitting;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Design your logo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer as much or as little as you like. We&apos;ll generate 6
          concepts to choose from.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Business name</label>
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Acme Coffee Co."
          maxLength={60}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Industry <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Specialty coffee roaster"
          maxLength={60}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Logo type</label>
        <div className="flex flex-wrap gap-2">
          {LOGO_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLogoType(t)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                logoType === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Style</label>
        <p className="text-xs text-muted-foreground">
          Auto lets the AI choose. Pick a look to steer every concept — and the
          final SVG — toward it.
        </p>
        <div className="flex flex-wrap gap-2">
          {LOGO_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                style === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Colour direction</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_DIRECTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColorDirection(c)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                colorDirection === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <label className="text-sm font-medium">Personality</label>
        {AXES.map(({ key, left, right }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{left}</span>
              <span>{right}</span>
            </div>
            <Slider
              value={[personality[key]]}
              onValueChange={([v]) =>
                setPersonality((p) => ({ ...p, [key]: v }))
              }
              min={0}
              max={100}
              step={1}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Anything else?{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Include a coffee bean; avoid red; keep it geometric."
          maxLength={300}
          rows={3}
        />
      </div>

      <Button
        className="w-full"
        disabled={!canSubmit}
        onClick={() =>
          onSubmit({
            businessName: businessName.trim(),
            industry: industry.trim(),
            logoType,
            style,
            colorDirection,
            personality,
            notes: notes.trim(),
          })
        }
      >
        {submitting ? "Generating…" : "Generate 6 concepts (5 credits)"}
      </Button>
    </div>
  );
}
