import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER, // your Gmail address
    pass: process.env.MAIL_PASS, // your Gmail app password
  },
});

/**
 * Send email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Email text content
 */
export const sendEmail = async (to, subject, text) => {
  try {
    // Verify transporter is ready
    await transporter.verify();
    console.log("✅ Gmail SMTP ready to send emails");

    const mailOptions = {
      from: `"Auth System" <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to} with subject "${subject}"`);
  } catch (err) {
    console.error("❌ Error sending email:", err);
    throw err;
  }
};
