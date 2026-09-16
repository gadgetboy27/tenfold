import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { withWorkspace } from "@/lib/api/with-workspace";
import { senderAddress } from "@/lib/email/sender";

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY)
      throw new Error("RESEND_API_KEY is not set");
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const schema = z.object({
  message: z.string().min(3).max(5000),
  email: z.string().email().optional(),
  page: z.string().max(200).optional(),
});

// POST /api/feedback — sends user feedback to admin@prettymuch.nz via Resend.
// Each call is an outbound email, so the default per-IP limit stays on.
export const POST = withWorkspace(async (req, { session }) => {
  const { message, email, page } = schema.parse(await req.json());

  const resend = getResendClient();
  await resend.emails.send({
    from: senderAddress("noreply", "PrettyMuch Feedback"),
    to: "admin@prettymuch.nz",
    ...(email ? { replyTo: email } : {}),
    subject: `Feedback · ${session.workspaceSlug ?? "prettymuch"}`,
    text: [
      `Workspace: ${session.workspaceSlug ?? "—"}`,
      `User ID: ${session.userId ?? "—"}`,
      `Reply-to: ${email ?? "(not provided)"}`,
      `Page: ${page ?? "—"}`,
      "",
      message,
    ].join("\n"),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
});
