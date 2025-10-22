import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(to, subject, text) {
  try {
    await resend.emails.send({
      from: 'Event Manager <no-reply@yourdomain.com>',
      to,
      subject,
      text,
    });
    console.log("✅ Email sent successfully");
  } catch (err) {
    console.error("❌ Error sending email:", err);
  }
}
