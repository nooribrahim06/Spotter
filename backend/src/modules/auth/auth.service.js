import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";


import { createUser } from "./user.repository.js";
import { findUserByEmail } from "./user.repository.js";
import { findUserById } from "./user.repository.js";
import { verifyUserByToken } from "./user.repository.js";

import nodemailer from "nodemailer";
import { emailSendError } from "../../middlewares/errorHandling.js";

import { invalidTokenError } from "../../middlewares/errorHandling.js";
import { InvalidCredentialsError } from "../../middlewares/errorHandling.js";
import { theftTriggerError } from "../../middlewares/errorHandling.js";


import * as jwtService from "./auth.tokens.js"; // Import the JWT service for token generation
import { theftTrigger } from "../../helpers/theftTrigger.js";

import * as RefreshTokenRepo from "./repositories/refreshToken.repository.js";
import * as AuthSessionRepo from "./repositories/authSession.repository.js";


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


export async function login({ email, password , userAgent, ip }) {

    // here is the actual buisness logic for login
    // 1. normalize the email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();
   
    // 2. if user found, compare the password with the stored hash using bcrypt.compare
    // 3. and if not found , compare so avoid timing attacks, and throw an error (invalid credentials)
     // to prevent timing attacks, we will use a dummy hash to compare with the password if the user is not found
    //  so that the time taken to respond is the same whether the user exists or not.
    // 5. if password does not match, throw an error (invalid credentials)

    // OWASP recommends not to reveal whether the email or password is incorrect, so we will just say "Invalid email or password" for both cases.
   
    const DUMMY_PASSWORD_HASH = "$2b$12$fuJ1FMKdu6mSmVkef.7hd.IdW0ZoL34nJAiOYUR/lYsttCQ8BodrC";
    const user = await findUserByEmail(normalizedEmail);
    const hashToCompare =
    user?.passwordHash ?? DUMMY_PASSWORD_HASH;

    // this now will take the same time whether the user exists or not, and whether the password is correct or not, which prevents timing attacks.
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);
    if (!user) {
        throw new InvalidCredentialsError();
    }
    if (!isPasswordValid) {
        throw new InvalidCredentialsError();
    }
    if(user.emailVerified === false) {
        throw new InvalidCredentialsError("Email not verified. Please check your email for the verification link.");
    }
    
    //============Authentication successful, now we need to create a session and generate tokens for the user.================
    // 1. generate refreshtoken and hash it 
    // 2. use transcation for both session and refresh token creation, so if one fails, the other is rolled back.
    // 3. generate accesstoken and return it to the controller, which will set it in the response body with session id and user object.
    // 4. set the refresh token in the cookie, with httpOnly, secure, sameSite=lax, and maxAge=7 days.
    // 5. return the user object to the controller, which will set it in the response body.
    const refreshToken = jwtService.generateRefreshToken();
    const refreshTokenHashed = jwtService.hashRefreshToken(refreshToken);
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");
    
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now


    const sessionId = await prisma.$transaction(async (cl) => {
        const sessionId = await AuthSessionRepo.createSession({
        userId: user.id,
        userAgent,
        ipHashed: ipHash,
        expiresAt: sessionExpiresAt
        }, cl);
        await RefreshTokenRepo.createRefreshToken({
        sessionId: sessionId,
        tokenHash: refreshTokenHashed,
        expiresAt: refreshExpiresAt
        }, cl);

        return sessionId;
    });

    const accessToken = jwtService.createAccessToken( {userId: user.id , sessionId});

    // we must return the data controller gonna need to attach in HTTP header 
    // the controller go
    return {
        user: {
            id: user.id,
            email: user.email,
            username: user.username
        },

        accessToken,
        refreshToken
    };
}

export async function refreshToken(refreshToken, ip) {
    // the funct will do that in order 
    // 1. hash the refresh token received from the client
    // 2. find the refresh token in the database and check:
    //  - if it exists - not expired - not revoked - not consumed 
    // 3. get the session id and check : 
    // - if the session exists - not expired - not revoked
    // 4. if all checks pass, generate a new access token and return it to the controller
    // 5. generate a new refresh token, hash it
    // 6. $transcation (make RT1 consumed , create RT2 , set replaced in RT1, update the session with new RT2, and update the session expiration date)
    // 7. return the new access token and new refresh token to the controller, which will set it in the response body and cookie respectively.

    const hashedToken = jwtService.hashRefreshToken(refreshToken);
    const refreshTokenRecord = await RefreshTokenRepo.findRefreshTokenByHash(hashedToken);
const now = new Date();

if (
  !refreshTokenRecord ||
  refreshTokenRecord.expiresAt <= now ||
  refreshTokenRecord.consumedAt !== null ||
  refreshTokenRecord.revokedAt !== null
) {
    if(refreshTokenRecord && refreshTokenRecord.consumedAt !== null) {
        // this will trigger a theft detection mechanism
        // and we will revoke the session and all refresh tokens associated with it.
        await theftTrigger(refreshTokenRecord.sessionId);
        throw new theftTriggerError("Refresh token has already been used. Possible token theft detected. All sessions have been revoked. Please log in again.");
    }
    throw new InvalidCredentialsError(
    "Invalid or expired refresh token."
  );
}

    const sessionId = refreshTokenRecord.sessionId;
    const session = await AuthSessionRepo.findSessionById(sessionId);
    if (!session || session.expiresAt < now || session.revokedAt !== null) {
        throw new InvalidCredentialsError("Invalid or expired session.");
    }

    const userId = session.userId;
    const user = await findUserById(userId);
    if (!user) {
        throw new InvalidCredentialsError("User not found.");
    }
    const newAccessToken = jwtService.createAccessToken({ userId, sessionId });

    const newRefreshToken = jwtService.generateRefreshToken();
    const newRefreshTokenHashed = jwtService.hashRefreshToken(newRefreshToken);
    const refreshWindowEndsAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    );
    // A refresh token must never remain valid after its session expires.
    const newRefreshExpiresAt = new Date(
        Math.min(refreshWindowEndsAt.getTime(), session.expiresAt.getTime())
    );

    try {
        await prisma.$transaction(async (cl) => {
            const result = await RefreshTokenRepo.consumeRefreshToken(
                refreshTokenRecord.id,
                now,
                cl
            );

            if (result.count !== 1) {
                // Another request consumed this token after our initial lookup.
                throw new theftTriggerError(
                    "Refresh token reuse detected. This session has been revoked. Please log in again."
                );
            }

            const newRefreshTokenId = await RefreshTokenRepo.createRefreshToken({
                sessionId,
                tokenHash: newRefreshTokenHashed,
                expiresAt: newRefreshExpiresAt
            }, cl);

            await RefreshTokenRepo.linkReplacement(
                refreshTokenRecord.id,
                newRefreshTokenId,
                cl
            );
            await AuthSessionRepo.UpdateLastUsedAt(sessionId, now, cl);
        });
    } catch (error) {
        // The rotation transaction has already rolled back at this point.
        if (error instanceof theftTriggerError) {
            await theftTrigger(sessionId);
        }

        throw error;
    }

    return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
    };
}
export async function logout(rawRefreshToken) {
  const tokenHash = jwtService.hashRefreshToken(rawRefreshToken);

  const tokenRecord =
    await RefreshTokenRepo.findRefreshTokenByHash(tokenHash);

  // Logout is idempotent: unknown/already-removed token is still success.
  if (!tokenRecord) return;

  await theftTrigger(tokenRecord.sessionId);
}