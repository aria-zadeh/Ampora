// Supabase Auth "Send Email" hook — sends Ampora's branded auth emails
// (magic link / signup / recovery / email-change) via Resend.
//
// This is invoked INTERNALLY by Supabase Auth (not the client), so it runs with
// verify_jwt = false. To make it live on a project you must ALSO:
//   1. set the RESEND_API_KEY secret on the project, and
//   2. enable it as the "Send Email" auth hook (Dashboard -> Authentication ->
//      Hooks -> Send Email hook -> point at this function).
// SUPABASE_URL is injected automatically by the edge runtime.
//
// NOTE: `onboarding@resend.dev` is Resend's shared test sender — in Resend test
// mode it only delivers to your own account email. Switch `from` to a verified
// domain (e.g. "Ampora <noreply@yourdomain>") for real users.
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    // Parse the hook payload directly — no signature verification needed since
    // this function is only called internally by Supabase Auth.
    const payload = await req.json();
    const user = payload.user as Record<string, string>;
    const email_data = payload.email_data as Record<string, string>;

    const { email_action_type, token_hash, redirect_to } = email_data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    const subjectMap: Record<string, string> = {
      magiclink: "Your Ampora sign-in link",
      signup: "Welcome to Ampora",
      recovery: "Reset your Ampora password",
      email_change: "Confirm your email change",
    };
    const subject = subjectMap[email_action_type] || "Ampora";

    const actionMap: Record<string, string> = {
      magiclink: "Sign in to Ampora",
      signup: "Confirm your email",
      recovery: "Reset your password",
      email_change: "Confirm email change",
    };
    const actionText = actionMap[email_action_type] || "Continue";

    const emailResult = await resend.emails.send({
      from: "Ampora <onboarding@resend.dev>",
      to: [user.email],
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px; text-align: center;">
          <h1 style="color: #18181B; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">Ampora</h1>
          <p style="color: #57534E; font-size: 16px; margin-bottom: 32px;">Built for brains that work differently</p>
          <a href="${confirmUrl}" style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600;">${actionText}</a>
          <p style="color: #A8A29A; font-size: 13px; margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    console.log("Email sent:", JSON.stringify(emailResult));

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-auth-email error:", (err as Error).message, (err as Error).stack);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
