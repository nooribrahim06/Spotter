import { databaseError } from "../../../middlewares/errorHandling.js";
import { prisma } from "../../../lib/prisma.js";


export async function createSession({ userId, userAgent, ipHashed, expiresAt }, db = prisma) {
    try {
    const session = await db.authSession.create({
    data: {
    userId: userId,
    expiresAt: expiresAt,
    userAgent: userAgent,
    ipHash: ipHashed, // we can add this properly after
  },
});


    return session.id;
    } catch(error) {
        throw new databaseError("Database error occurred while creating session.");
    }
}

export async function findSessionById(sessionId, db = prisma) {
    try {
        const session = await db.authSession.findUnique({
            where: {
                id: sessionId
            }
        });
        return session;
    } catch (error) {
        throw new databaseError("Database error occurred while finding session.");
    }
}

export async function UpdateLastUsedAt(sessionId, LastUsedAt, db = prisma) {
    try {
        const updatedSession = await db.authSession.update({
            where: {
                id: sessionId
            },
            data: {
                lastUsedAt: LastUsedAt
            }
        });
        return updatedSession;
    } catch (error) {
        throw new databaseError("Database error occurred while updating session expiration.");
    }
}

export async function updateRevokedAt(sessionId, revokedAt, db = prisma) {
    try {
        const updatedSession = await db.authSession.update({
            where: {
                id: sessionId
            },
            data: {
                revokedAt: revokedAt
            }
        });
        return updatedSession;
    } catch (error) {
        throw new databaseError("Database error occurred while updating session revocation.");
    }
}
