import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabase } from "../../../lib/supabase";

// Sends an email from your Gmail account via SMTP + an App Password.
// Returns a confirmed message id and logs the send against the lead.
//
// POST body: { leadId, to, subject, body }
//
// Setup: enable 2-Step Verification on your Google account, create an
// App Password (Google Account > Security > App passwords), and set
// GMAIL_USER and GMAIL_APP_PASSWORD in your environment.

export async function POST(req) {
  try {
    const { leadId, to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "to, subject and body are required." }, { status: 400 });
    }
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      return NextResponse.json(
        { error: "Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD." },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    // A plain-text unsubscribe footer keeps you compliant and out of spam.
    const unsubscribe =
      "\n\n--\nIf you would rather not hear from me, just reply STOP and I will not write again.";
    const fromName = process.env.GMAIL_FROM_NAME;
    const info = await transporter.sendMail({
      from: fromName ? `${fromName} <${user}>` : user,
      to,
      subject,
      text: body + unsubscribe,
      headers: {
        // A real unsubscribe header is a strong signal to inbox filters.
        "List-Unsubscribe": `<mailto:${user}?subject=unsubscribe>`,
      },
    });

    // Log the confirmed send so the dashboard counter is real.
    if (leadId) {
      const supabase = getSupabase();
      await supabase
        .from("leads")
        .update({
          status: "Contacted",
          last_message_id: info.messageId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }

    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
