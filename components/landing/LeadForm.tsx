"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingField } from "@/lib/landing/blocks";
import type { ToneStyle } from "./theme";

/**
 * The form on a public landing page.
 *
 * The only client component on this page, and the only place a visitor can
 * write to us. It posts to /api/pages/[slug]/lead, which does the real
 * validation — everything here is convenience, not enforcement.
 */
export function LeadForm({
  slug,
  fields,
  submitLabel,
  successMessage,
  tone,
}: {
  slug: string;
  fields: LandingField[];
  submitLabel: string;
  successMessage: string;
  tone: ToneStyle;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  // When the form appeared. A submission faster than a human can type is the
  // second half of the honeypot, and it costs the visitor nothing.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  if (state === "sent") {
    return (
      <p
        className="rounded-xl px-5 py-6 text-center text-lg"
        style={{ background: "rgba(0,0,0,0.05)", color: tone.color }}
      >
        {successMessage}
      </p>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const data = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    for (const f of fields) values[f.name] = String(data.get(f.name) ?? "");

    try {
      const res = await fetch(`/api/pages/${slug}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: values,
          website: String(data.get("website") ?? ""),
          elapsedMs: Date.now() - mountedAt.current,
          source: {
            referrer: document.referrer.slice(0, 500),
            ...Object.fromEntries(
              ["utm_source", "utm_medium", "utm_campaign"]
                .map((k) => [k, new URLSearchParams(location.search).get(k)])
                .filter(([, v]) => v),
            ),
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "That didn't send.");
      setState("sent");
    } catch (err) {
      // Never clear what they typed on a failure — retyping a form is how a
      // real lead gives up.
      setError((err as Error).message);
      setState("idle");
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "#ffffff",
    color: "#1c1917",
    borderColor: "rgba(0,0,0,0.15)",
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-md flex-col gap-3">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-left">
          <span className="text-sm font-medium" style={{ color: tone.color }}>
            {f.label}
            {f.required && <span aria-hidden> *</span>}
          </span>
          {f.type === "textarea" ? (
            <textarea
              name={f.name}
              required={f.required}
              rows={4}
              style={inputStyle}
              className="rounded-lg border px-3 py-2.5 text-base outline-none focus:border-current"
            />
          ) : (
            <input
              type={f.type}
              name={f.name}
              required={f.required}
              autoComplete={
                f.type === "email"
                  ? "email"
                  : f.type === "tel"
                    ? "tel"
                    : undefined
              }
              style={inputStyle}
              className="rounded-lg border px-3 py-2.5 text-base outline-none focus:border-current"
            />
          )}
        </label>
      ))}

      {/* The honeypot. Hidden from sight AND from screen readers and tab order
          — a field only a bot fills is worthless if a keyboard user lands in
          it by accident. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          opacity: 0,
        }}
      />

      {error && (
        <p className="text-sm" style={{ color: "#dc2626" }} role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-1 rounded-lg px-6 py-3 text-base font-semibold transition-opacity disabled:opacity-60"
        style={{ background: tone.buttonBg, color: tone.buttonColor }}
      >
        {state === "sending" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
