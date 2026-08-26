import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { createVerifyEmail } from "../emails-temp/verifyUremail.js";

const VERIFICATION_EMAIL_MASCOT_PATH = fileURLToPath(
  new URL(
    "../emails-temp/assets/01_idle_hello_384x512.png",
    import.meta.url
  )
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_APP_PASSWORD,
  },
});

export async function sendVerificationEmail({
  email,
  rawToken,
  username = "User",
}) {
  return transporter.sendMail({
    from: `"Spotter" <${env.EMAIL_USER}>`,
    to: email,
    subject: "Verify your email for Spotter",
    text: `Click the link to verify your email: ${env.FRONTEND_URL}/verify-email?token=${rawToken}`,
    html: createVerifyEmail(username, rawToken),
    attachments: [
      {
        filename: "spotter-mascot.png",
        path: VERIFICATION_EMAIL_MASCOT_PATH,
        cid: "spotter-verification-mascot",
      },
    ],
  });
}
