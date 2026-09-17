import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { withWorkspace } from "@/lib/api/with-workspace";
import { senderAddress } from "@/lib/email/sender";
import * as Sentry from "@sentry/nextjs";

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const CATEGORIES = ["bug", "idea", "question", "other"] as const;

const schema = z.object({
  message: z.string().min(3).max(5000),
  category: z.enum(CATEGORIES).default("other"),
  email: z.string().email().optional(),
  /** Captured by the widget, never typed: where and on what it happened. */
  context: z
    .object({
      page: z.string().max(300).optional(),
      section: z.string().max(40).optional(),
      campaignId: z.string().uuid().optional(),
      userAgent: z.string().max(400).optional(),
      viewport: z.string().max(40).optional(),
      tz: z.string().max(60).optional(),
    })
    .default({}),
});

// POST /api/feedback — save a report to the feedback queue, then notify.
//
// The row is the record; the email is a notification. They're ordered that
// way on purpose: a Resend outage used to lose the report entirely, and
// nothing anywhere could say whether a report had been looked at. Now the
// save must succeed and the mail is best-effort.
export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const { message, category, email, context } = schema.parse(await req.json());

  // The sender's address, resolved server-side so nobody has to type it and
  // so a report can't claim to be from someone else.
  let userEmail: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(session.userId);
    userEmail = data.user?.email ?? null;
  } catch {
    /* the report is still worth keeping without it */
  }

  const { data: row, error } = await db
    .from("feedback")
    .insert({
      user_id: session.userId,
      user_email: userEmail,
      category,
      message,
      reply_to: email ?? null,
      context,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const resend = getResendClient();
  if (resend) {
    try {
      await resend.emails.send({
        from: senderAddress("noreply", "PrettyMuch Feedback"),
        to: "admin@prettymuch.nz",
        ...(email || userEmail ? { replyTo: email ?? userEmail! } : {}),
        subject: `[${category}] ${session.workspaceSlug || "prettymuch"} · ${message.slice(0, 60)}`,
        text: [
          message,
          "",
          "—",
          `From: ${userEmail ?? session.userId}${email ? ` (reply to ${email})` : ""}`,
          `Workspace: ${session.workspaceSlug || session.workspaceId}`,
          `Page: ${context.page ?? "—"}`,
          `Section: ${context.section ?? "—"}`,
          `Campaign: ${context.campaignId ?? "—"}`,
          `Browser: ${context.userAgent ?? "—"}`,
          `Viewport: ${context.viewport ?? "—"} · ${context.tz ?? ""}`,
          "",
          `Queue: GET /api/ops/feedback  ·  id ${(row as { id: string }).id}`,
        ].join("\n"),
      });
    } catch (e) {
      // Saved is what matters; the missed mail is ours to notice, not theirs.
      Sentry.captureException(e);
    }
  }

  return NextResponse.json(
    { ok: true, id: (row as { id: string }).id },
    {
      status: 201,
    },
  );
});
