import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { getSession } from "@/lib/auth/session";

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

// POST /api/feedback — sends user feedback to admin@tenfold.nz via Resend.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const { message, email, page } = schema.parse(await req.json());

    const resend = getResendClient();
    await resend.emails.send({
      from: "Tenfold Feedback <noreply@tenfold.nz>",
      to: "admin@tenfold.nz",
      ...(email ? { replyTo: email } : {}),
      subject: `Feedback · ${session.workspaceSlug ?? "tenfold"}`,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
