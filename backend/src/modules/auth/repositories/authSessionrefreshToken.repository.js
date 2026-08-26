import { prisma } from "../../../lib/prisma.js";
import { databaseError } from "../../../middlewares/errorHandling.js";

export async function revokeAllSessionsForUser(userId) {
  const now = new Date();

  try {
    await prisma.$transaction([
      prisma.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
      prisma.refreshToken.updateMany({
        where: {
          session: {
            userId,
          },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);
  } catch {
    throw new databaseError(
      "Database error occurred while revoking all sessions for user."
    );
  }
}
