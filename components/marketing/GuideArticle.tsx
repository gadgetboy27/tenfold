import Link from "next/link";
import type { Guide, GuideSection } from "@/lib/marketing/guides";

/**
 * The body of a guide or pillar page — shared so both page types carry the
 * same extractable shape: question H2 → standalone answer → bullets / table.
 * The page owns its own nav, schema and CTA; this owns only the article.
 */
export function GuideArticle({ guide }: { guide: Guide }) {
  return (
    <article>
      <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
        {guide.title}
      </h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Updated{" "}
        {new Date(guide.updated).toLocaleDateString("en-NZ", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>

      {/* The direct answer, up front. Burying it below preamble costs both
          readers and the answer engines that increasingly surface pages. */}
      <p className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5 text-[15px] leading-relaxed text-foreground">
        {guide.answer}
      </p>

      <div className="mt-10 space-y-10">
        {guide.sections.map((s) => (
          <Section key={s.heading} section={s} />
        ))}
      </div>

      {guide.faq && guide.faq.length > 0 && (
        <section className="mt-14 space-y-6">
          <h2 className="text-xl font-semibold">Frequently asked questions</h2>
          {guide.faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold text-foreground">{f.q}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

function Section({ section: s }: { section: GuideSection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{s.heading}</h2>
      {s.answer && (
        <p className="text-[15px] leading-relaxed text-foreground">
          {s.answer}
        </p>
      )}
      {s.body?.map((p, i) => (
        <p
          key={i}
          className="text-[15px] leading-relaxed text-muted-foreground"
        >
          {p}
        </p>
      ))}
      {s.bullets && (
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground">
          {s.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {s.table && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-foreground">
              <tr>
                {s.table.columns.map((c) => (
                  <th key={c} scope="col" className="px-4 py-2.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {s.table.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function GuideCta({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mt-14 rounded-2xl border border-border bg-card p-6">
      <p className="text-sm font-semibold text-foreground">{heading}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Link
        href="/signup"
        className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
      >
        Get started free
      </Link>
    </div>
  );
}
