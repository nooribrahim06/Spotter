import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";
import { DuplicateUserError } from "../../middlewares/errorHandling.js";
/**
 * Creates a new user in the database.
 * Returns the created user object (excluding sensitive fields).
 * Throws a formatted error if email or username already exists.
 */

// =========== Create a new user ============
export async function createUser(
  {
    email,
    username,
    passwordHash,
    verifyToken,
    verifyTokenExpiresAt,
  },
  db = prisma
) {
  try {
    const user = await db.user.create({
      data: {
        email,
        username,
        passwordHash,
        verifyToken, 
        verifyTokenExpiresAt,
        // emailVerified defaults to false in the schema
      },
      // Only select the fields we actually need in the response.

      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        emailVerified: true,
      },
    });

    return user;
  } catch (error) {
    // Prisma error P2002 = unique constraint violation.
    // error.meta.target tells us WHICH field(s) collided.
    if (error.code === "P2002") {
      let field = "email or username";
      if (Array.isArray(error.meta?.target)) {
        field = error.meta.target[0];
      } else if (typeof error.meta?.target === "string") {
        field = error.meta.target;
      }
      
      
      throw new DuplicateUserError(field);
    }
    // Re-throw other unexpected database errors
    throw new databaseError("Database error occurred while creating user.");
  }
}



// ========== Read ===================
// find user by email , return the hashed password and emailVerified status
export async function findUserByEmail(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        passwordHash: true,
        emailVerified: true,
        onboardingStatus: true,
        onboardingStep: true,
        userProfile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return user;
  } catch (error) {
    // if the user is not found, prisma will return null and we need to handle that in the service layer, not here.
    throw new databaseError("Database error occurred while finding user by email.");
  }
}

// onboarding needs these extra selected fields too. without them req.user knows
// the identity but does not know whether it should open onboarding or app home.
export async function findUserById(id, db = prisma) {
  try {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        language: true,
        country: true,
        timezone: true,
        role: true,
        emailVerified: true,
        onboardingStatus: true,
        onboardingStep: true,
        fitnessOnboardingCompletedAt: true,
        createdAt: true,
        updatedAt: true,
        userProfile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return user;
  } catch (error) {
    throw new databaseError("Database error occurred while finding user by ID.");
  }
}

// Password hashes are selected only for a specific sensitive-action check.
// They never become part of req.user or a normal account/profile response.
export async function findUserPasswordHashById(id, db = prisma) {
  try {
    return await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        passwordHash: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while confirming the account password."
    );
  }
}

export async function findPendingVerificationEmailRecipient({
  userId,
  verificationTokenHash,
}) {
  try {
    return await prisma.user.findFirst({
      where: {
        id: userId,
        emailVerified: false,
        verifyToken: verificationTokenHash,
        verifyTokenExpiresAt: {
          gt: new Date(),
        },
      },
      select: {
        email: true,
        username: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding a verification email recipient."
    );
  }
}
 // ========== Update ===================
 // // Repository
export async function verifyUserByToken(hashedToken) {
  try {
    const result = await prisma.user.updateMany({
    where: {
      verifyToken: hashedToken,
      verifyTokenExpiresAt: {
        gt: new Date(),
      },
      emailVerified: false,
    },
    data: {
      emailVerified: true,
      verifyToken: null,
      verifyTokenExpiresAt: null,
    },
  });
  return result.count; // number of rows updated
}
  catch (error) {
    // need to analyze the error and throw a formatted error
    throw new databaseError("Database error occurred while verifying user."); 
  }


}
export async function replaceVerificationToken({
  userId,
  verifyToken,
  verifyTokenExpiresAt,
}, db = prisma) {
  try {
    const result = await db.user.updateMany({
      where: {
        id: userId,
        emailVerified: false,
      },
      data: {
        verifyToken,
        verifyTokenExpiresAt,
      },
    });

    return result.count;
  } catch {
    throw new databaseError(
      "Database error occurred while replacing the verification token."
    );
  }
}

// ============ Move the user to another onboarding step ============
// db may be the normal Prisma client or tx when the service is inside a transaction.
export async function updateUserOnboardingStatus(userId, onboardingStatus, onboardingStep, db = prisma) {
  try {
    const result = await db.user.updateMany({
      where: {
        id: userId,
      },
      data: {
        onboardingStatus,
        onboardingStep,
      },
    });
    return result;
  } catch (error) {
    throw new databaseError("Database error occurred while updating user onboarding status.");
  }
}

// ============ Claim the final completion ============
// updateMany gives us count. count 1 means this request won; count 0 means
// another request already completed it, so we do not duplicate related records.
export async function claimOnboardingCompletion(
  userId,
  completedAt,
  db = prisma
) {
  try {
    return await db.user.updateMany({
      where: {
        id: userId,
        onboardingStatus: { not: "COMPLETED" },
        onboardingStep: 3,
      },
      data: {
        onboardingStatus: "COMPLETED",
        onboardingStep: null,
        fitnessOnboardingCompletedAt: completedAt,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while completing onboarding."
    );
  }
}
