import { databaseError } from "../../../middlewares/errorHandling.js";
import { prisma } from "../../../lib/prisma.js";


export async function createRefreshToken({ sessionId, tokenHash , expiresAt}, db = prisma) {
    try {
        const refreshToken = await db.refreshToken.create({
            data: {
                sessionId,
                tokenHash, 
                expiresAt: expiresAt,
            }
        });
        return refreshToken.id;
    } catch (error) {
        throw new databaseError("Database error occurred while creating refresh token.");
    }
} 

export async function findRefreshTokenByHash(tokenHash, db = prisma) {
    try {
        const refreshToken = await db.refreshToken.findUnique({
            where: {
                tokenHash: tokenHash
            }
        });
        return refreshToken;
    } catch (error) {
        throw new databaseError("Database error occurred while finding refresh token.");
    }
}
export async function consumeRefreshToken(
  tokenId,
  consumedAt,
  db = prisma
) {
  try {
    return await db.refreshToken.updateMany({
      where: {
        id: tokenId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: consumedAt,
        },
      },
      data: {
        consumedAt,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while consuming refresh token."
    );
  }
}

export async function linkReplacement(
  oldTokenId,
  newTokenId,
  db = prisma
) {
  try {
    return await db.refreshToken.update({
      where: {
        id: oldTokenId,
      },
      data: {
        replacedByTokenId: newTokenId,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while linking refresh tokens."
    );
  }
}

export async function revokeAllRefreshTokensForSession(sessionId, revokedAt, db = prisma) {
  try {
    return await db.refreshToken.updateMany({
        where: {
            sessionId: sessionId,
            revokedAt: null,
        },
        data: {
            revokedAt: revokedAt,
        }
    });
  } catch (error) {
    throw new databaseError("Database error occurred while revoking refresh tokens.");
  }         
    };