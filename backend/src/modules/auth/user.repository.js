import { prisma } from "../../lib/prisma.js";

/**
 * Creates a new user in the database.
 * Returns the created user object (excluding sensitive fields).
 * Throws a formatted error if email or username already exists.
 */
export async function createUser({ email, username, passwordHash, verifyToken, verifyTokenExpiresAt }) {
  try {
    const user = await prisma.user.create({
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
      
      const err = new Error(`A user with that ${field} already exists.`);
      err.statusCode = 409; // 409 Conflict
      throw err;
    }
    // Re-throw other unexpected database errors
    throw error;
  }
}
