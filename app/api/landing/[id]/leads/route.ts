import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

/**
 * The leads a page collected, as CSV.
 *
 * A lead nobody can see is worse than no form at all — it takes a real enquiry
 * from a real person and loses it silently, which is worse than never having
 * asked. So this ships alongside the form, not after it.
 *
 * CSV rather than a table in the app, for now: a lead's next stop is a phone,
 * a CRM or a spreadsheet, and every one of those reads CSV. The same "take it
 * with you" principle as the campaign pack.
 */

/** RFC 4180 quoting, plus the spreadsheet-formula guard. */
function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // A field beginning =, +, - or @ is executed as a formula when the file is
  // opened in Excel or Sheets. These values were typed by anonymous strangers
  // on a public form, so that is a live injection path, not a theoretical one.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data: pageRow } = await db
      .from("landing_pages")
      .select("id, slug, title")
      .eq("id", params.id)
      .maybeSingle();
    if (!pageRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const page = pageRow as { id: string; slug: string; title: string };

    const { data } = await db
      .from("page_leads")
      .select("fields, source, created_at")
      .eq("page_id", page.id)
      .order("created_at", { ascending: false });

    const leads = (data ?? []) as {
      fields: Record<string, string>;
      source: Record<string, string>;
      created_at: string;
    }[];

    // Columns come from the leads themselves, not from the page's current form
    // block: the form may have been edited since, and a lead answering a
    // question that no longer exists must still export its answer.
    const fieldKeys = [...new Set(leads.flatMap((l) => Object.keys(l.fields)))];
    const sourceKeys = [
      ...new Set(leads.flatMap((l) => Object.keys(l.source))),
    ];

    const header = ["received", ...fieldKeys, ...sourceKeys];
    const rows = leads.map((l) =>
      [
        l.created_at,
        ...fieldKeys.map((k) => l.fields[k] ?? ""),
        ...sourceKeys.map((k) => l.source[k] ?? ""),
      ]
        .map(csvCell)
        .join(","),
    );

    const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${page.slug}-leads.csv"`,
        // Leads arrive continuously; a cached export is a wrong answer with a
        // convincing filename.
        "cache-control": "no-store",
      },
    });
  },
);
