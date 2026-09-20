import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
// TEMP Vercel: restore these imports when re-enabling queued delivery.
// import {fromPrisma} from 'pg-boss';
// import { boss, VERIFICATION_EMAIL_QUEUE } from "../../queues/queue.js";
// import { encryptQueueToken } from "../../queues/queueCrypto.js";

import { sendVerificationEmail } from "../../emails/verificationEmail.service.js";

import { createUser } from "../users/user.repository.js";
import { findUserByEmail } from "../users/user.repository.js";
import { findUserById } from "../users/user.repository.js";
import { verifyUserByToken } from "../users/user.repository.js";
import { replaceVerificationToken } from "../users/user.repository.js";

// the database keeps enums uppercase, but the frontend routing contract uses
// lowercase. login and refresh must return the same shape or refresh will break it.
function publicOnboardingStatus(status) {
    return status.toLowerCase();
}


import { invalidTokenError } from "../../middlewares/errorHandling.js";
import { InvalidCredentialsError } from "../../middlewares/errorHandling.js";
import { InvalidRefreshTokenError } from "../../middlewares/errorHandling.js";
import { InvalidSessionError } from "../../middlewares/errorHandling.js";
import { theftTriggerError } from "../../middlewares/errorHandling.js";
import { RefreshTokenRaceError } from "../../middlewares/errorHandling.js";


import * as jwtService from "./auth.tokens.js"; // Import the JWT service for token generation
import { theftTrigger } from "../../helpers/theftTrigger.js";

import * as RefreshTokenRepo from "./repositories/refreshToken.repository.js";
import * as AuthSessionRepo from "./repositories/authSession.repository.js";
import { revokeAllSessionsForUser } from "./repositories/authSessionrefreshToken.repository.js";

const REFRESH_RACE_GRACE_MS = 5_000;

const RESEND_VERIFICATION_RESPONSE = {
    message: "If the account exists and is not verified, a verification email has been sent.",
};

function createEmailVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    return {
        rawToken,
        hashedToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
}

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
    const verificationToken = createEmailVerificationToken();
    // const encryptedToken = encryptQueueToken(verificationToken.rawToken);

    // TEMP Vercel: persist first, then await email outside the transaction.
    // Queue calls are retained below for restoring worker-based delivery.
    await prisma.$transaction(async (tx) => {
    const user = await createUser({
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        verifyToken: verificationToken.hashedToken,
        verifyTokenExpiresAt: verificationToken.expiresAt,
    }, tx);

  /* TEMP Vercel: queued delivery disabled.
  await boss.send(
    VERIFICATION_EMAIL_QUEUE,
    {
      userId: user.id,
      encryptedToken,
      verificationTokenHash: verificationToken.hashedToken,
    },
    {
      db: fromPrisma(tx),
    }
  );
  */
});
    // If delivery fails, the unverified account remains; use resend to recover.
    await sendVerificationEmail({
        email: normalizedEmail,
        username: normalizedUsername,
        rawToken: verificationToken.rawToken,
    });
    // 6. Return response to controller
    return {
        message: "User created successfully. Check your email to verify your account.",
    };
}

export async function resendVerificationEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(normalizedEmail);

    // Use the same response for missing, verified, and eligible accounts to
    // avoid disclosing whether an email address is registered.
    if (!user || user.emailVerified) {
        return RESEND_VERIFICATION_RESPONSE;
    }

    const verificationToken = createEmailVerificationToken();
    // const encryptedToken = encryptQueueToken(verificationToken.rawToken);
    const updatedCount = await prisma.$transaction(async (tx) => {
        const updatedCount = await replaceVerificationToken({
        userId: user.id,
        verifyToken: verificationToken.hashedToken,
        verifyTokenExpiresAt: verificationToken.expiresAt,
    }, tx);

    if (updatedCount === 0) return 0;

    /* TEMP Vercel: queued delivery disabled.
    await boss.send(
    VERIFICATION_EMAIL_QUEUE,
    {
      userId: user.id,
      encryptedToken,
      verificationTokenHash: verificationToken.hashedToken,

    },
    {
      db: fromPrisma(tx),
    }
  );
    */
    return updatedCount;
    });

    if (updatedCount > 0) {
        try {
            await sendVerificationEmail({
                email: user.email,
                username: user.username,
                rawToken: verificationToken.rawToken,
            });
        } catch {
            // Preserve the generic resend response even when delivery fails.
            // No worker retry in temporary direct-delivery mode.
            console.error("Verification email delivery failed during resend.");
        }
    }
    return RESEND_VERIFICATION_RESPONSE;
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
        throw new InvalidCredentialsError();
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
    
    const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRATION * 24 * 60 * 60 * 1000); // 7 days from now
    const sessionExpiresAt = new Date(Date.now() + env.SESSION_EXPIRATION * 24 * 60 * 60 * 1000); // 30 days from now


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
            username: user.username,
            firstName: user.userProfile?.firstName ?? null,
            lastName: user.userProfile?.lastName ?? null,
            onboardingStatus: publicOnboardingStatus(user.onboardingStatus),
            onboardingStep: user.onboardingStep,
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
  refreshTokenRecord.revokedAt !== null
) {
    throw new InvalidRefreshTokenError();
}

if (refreshTokenRecord.consumedAt !== null) {
    const reuseAgeMs = now.getTime() - refreshTokenRecord.consumedAt.getTime();

    // A very recent reuse can be caused by two legitimate browser requests
    // racing. The client may retry with the cookie set by the winning request.
    if (reuseAgeMs >= 0 && reuseAgeMs <= REFRESH_RACE_GRACE_MS) {
        throw new RefreshTokenRaceError();
    }

    await theftTrigger(refreshTokenRecord.sessionId);
    throw new theftTriggerError("Refresh token has already been used. Possible token theft detected. All sessions have been revoked. Please log in again.");
}

    const sessionId = refreshTokenRecord.sessionId;
    const session = await AuthSessionRepo.findSessionById(sessionId);
    if (!session || session.expiresAt < now || session.revokedAt !== null) {
        throw new InvalidSessionError();
    }

    const userId = session.userId;
    const user = await findUserById(userId);
    if (!user) {
        throw new InvalidSessionError();
    }
    const newAccessToken = jwtService.createAccessToken({ userId, sessionId });

    const newRefreshToken = jwtService.generateRefreshToken();
    const newRefreshTokenHashed = jwtService.hashRefreshToken(newRefreshToken);
    const refreshWindowEndsAt = new Date(
        Date.now() + env.REFRESH_TOKEN_EXPIRATION * 24 * 60 * 60 * 1000
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
                throw new RefreshTokenRaceError();
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
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.userProfile?.firstName ?? null,
            lastName: user.userProfile?.lastName ?? null,
            onboardingStatus: publicOnboardingStatus(user.onboardingStatus),
            onboardingStep: user.onboardingStep,
        },
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


export async function logoutAllSessions(rawRefreshToken) {
    const tokenHash = jwtService.hashRefreshToken(rawRefreshToken);
    const tokenRecord = await RefreshTokenRepo.findRefreshTokenByHash(tokenHash);
    const now = new Date();

    // Keep logout idempotent, but never let an old, stolen token revoke a
    // user's current sessions.
    if (
        !tokenRecord ||
        tokenRecord.expiresAt <= now ||
        tokenRecord.revokedAt !== null ||
        tokenRecord.consumedAt !== null
    ) {
        return;
    }

    const session = await AuthSessionRepo.findSessionById(tokenRecord.sessionId);

    if (
        !session ||
        session.expiresAt <= now ||
        session.revokedAt !== null
    ) {
        return;
    }

    await revokeAllSessionsForUser(session.userId);
}
