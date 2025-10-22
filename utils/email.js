import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Create transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,        // 465 for SSL, 587 for TLS
  secure: true,     // true for 465, false for 587
  auth: {
    user: process.env.MAIL_USER, // Gmail address
    pass: process.env.MAIL_PASS, // Gmail App Password
  },
  connectionTimeout: 20000, // 20 seconds timeout
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent: ${info.messageId}`);
  } catch (err) {
    console.error("❌ Error sending email:", err);
    throw err;
  }
};
