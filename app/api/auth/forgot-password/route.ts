import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { serverPublicEnv } from "@/lib/env/public-server";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL}/reset-password`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Send confirmation email via Resend
    const resend = getResendClient();
    await resend.emails.send({
      from: "noreply@tenfold.nz",
      to: email,
      subject: "Reset your tenfold password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hi there,</p>
          <p>We received a request to reset your password. Click the link below to set a new password:</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/reset-password" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
          <p>Or copy this link: <code>${process.env.NEXT_PUBLIC_APP_URL}/reset-password</code></p>
          <p>This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">tenfold.nz</p>
        </div>
      `,
    });

    return NextResponse.json(
      {
        message: "Password reset email sent",
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
