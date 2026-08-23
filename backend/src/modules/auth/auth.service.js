import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createUser } from "./user.repository.js";
import { verifyUserByToken } from "./user.repository.js";
import nodemailer from "nodemailer";
import { emailSendError } from "../../middlewares/errorHandling.js";
import { invalidTokenError } from "../../middlewares/errorHandling.js";
// Configure Nodemailer for Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // e.g., 'your.email@gmail.com'
        pass: process.env.EMAIL_APP_PASSWORD // The 16-character app password
    }
});

//  signup 
// Receives the validated body from the controller (email, username, password).
// Returns an object the controller can send back as JSON.
export async function signup({ email, username, password }) {

    // 1. Normalization to email and username 
    // emails are case-insensitive by spec (RFC 5321), so we lowercase them
    // to avoid "User@Gmail.com" and "user@gmail.com" being treated as two
    // different accounts.  Same idea for usernames.
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    // 2. Hash the password using bcrypt
    // bcrypt is intentionally slow — that's the point.  If an attacker
    // gets the database, they can't reverse the hashes easily.
    // saltRounds = 12  →  ~250 ms per hash on modern hardware.
    //   10 is the default, 12 is a good balance between security and speed.
    // OWASP suggests to make rounds at least 10
    const SALT_ROUNDS = 12;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 3. Generate email-verification token 
    // crypto.randomBytes(32) → 32 random bytes → 64-char hex string.
    // This is the "raw" token we'll put inside the verification link
    // that we email to the user.
    const rawToken = crypto.randomBytes(32).toString("hex");

    // We do NOT store the raw token in the DB.  If the DB leaks, an
    // attacker could verify any account.  Instead we store a SHA-256 hash.
    // SHA-256 is fine here (unlike passwords) because the input is already
    // 256 bits of pure randomness — it can't be brute-forced.
    // actually the attacker wil need 2^256 attempts to brute force the token, which is infeasible.
    const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex"); // 64-char hex string → fits VarChar(64)

    // The token expires in 24 hours.
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 4. Save the user to the database 
    // this is a repo layer responsibility not a service layer responsibility
    const user = await createUser({
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        verifyToken: hashedToken,
        verifyTokenExpiresAt: tokenExpiresAt,
    });

    // 5. Send verification email 
    try {
        const info = await transporter.sendMail({
            from: `"Spotter" <${process.env.EMAIL_USER}>`,
            to: normalizedEmail,
            subject: 'Verify your email for Spotter',
            text: `Click the link to verify your email: ${process.env.FRONTEND_URL}/verify-email?token=${rawToken}`,
            html: `<p>Welcome to Spotter!</p><p>Click <a href="${process.env.FRONTEND_URL}/verify-email?token=${rawToken}">here</a> to verify your email.</p>`
        });
        console.log("✅ Verification email sent! ID:", info.messageId);
    } catch (error) {
        console.error("❌ Failed to send verification email:", error);
        throw new emailSendError("Failed to send verification email. Please try again later.");
    }

    // 6. Return response to controller
    return {
        message: "User created successfully. Check your email to verify your account.",
    };
}


export async function verifyEmail(token) {
    // 1. hash the token received from the user
    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex"); // 64-char hex string → fits VarChar(64)
    // 2. find the user with that hashed token and check if it's expired
    const updatedCount = await verifyUserByToken(hashedToken);

    if (updatedCount === 0) {
        throw new invalidTokenError("Verification link is invalid or has expired.");
    }

    return {
         message: "Email verified successfully.",
        };
    // 3. if the repo succeded , update the user to set emailVerified = true, and clear the token and expiration
    // 4. return a success message to the controller
}