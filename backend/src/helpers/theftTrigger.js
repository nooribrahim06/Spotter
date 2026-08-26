import { prisma } from "../lib/prisma.js";

import * as RefreshTokenRepo from "../modules/auth/repositories/refreshToken.repository.js";
import * as AuthSessionRepo from "../modules/auth/repositories/authSession.repository.js";



export async function theftTrigger(sessionId) {
  const now = new Date();

  await prisma.$transaction(async (cl) => {
    await AuthSessionRepo.updateRevokedAt(sessionId, now, cl);
    await RefreshTokenRepo.revokeAllRefreshTokensForSession(
      sessionId,
      now,
      cl
    );
  });
}
