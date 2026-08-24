import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";
import { DuplicateUserError } from "../../middlewares/errorHandling.js";
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
      
      
      throw new DuplicateUserError(field);
    }
    // Re-throw other unexpected database errors
    throw new databaseError("Database error occurred while creating user.");
  }
}


// Repository
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
      },
    });
    return user;
  } catch (error) {
    // if the user is not found, prisma will return null and we need to handle that in the service layer, not here.
    throw new databaseError("Database error occurred while finding user by email.");
  }
}

export async function findUserById(id) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        emailVerified: true,
      },
    });
    return user;
  } catch (error) {
    throw new databaseError("Database error occurred while finding user by ID.");
  }
}