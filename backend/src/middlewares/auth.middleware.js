import { findUserById } from "../modules/auth/user.repository.js";
import { findSessionById } from "../modules/auth/repositories/authSession.repository.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { InvalidAccessTokenError } from "./errorHandling.js";
/*
1. Get access token
2. Verify JWT
3. Extract userId
4. Find user
5. Put user on req.user
*/



export async function authenticateToken(req, res, next) {
  const authHeader = req.get("authorization");
    // if the header is not present or does not start with "Bearer ", we throw an error
  if (!authHeader?.startsWith("Bearer ")) {
    throw new InvalidAccessTokenError();
  }
  // the header can be smth like "Bearer <token>",
  //  so we slice the first 7 characters to get the token, and trim any whitespace
  // if authHeader = "Bearer  " we throw an error, because the token is empty
  const token = authHeader.slice(7).trim();

  if (!token) {
    throw new InvalidAccessTokenError();
  }

  let decoded;

  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw new InvalidAccessTokenError();
  }

  // This remains outside the JWT catch so database errors remain 500 errors.
  const [user, session] = await Promise.all([
    findUserById(decoded.sub),
    findSessionById(decoded.sid),
  ]);
  const now = new Date();

  if (
    !user ||
    !user.emailVerified ||
    !session ||
    session.userId !== user.id ||
    session.expiresAt <= now ||
    session.revokedAt !== null
  ) {
    throw new InvalidAccessTokenError();
  }

  req.auth = { // this step sound unnecessary, but it is useful for future expansion, like adding roles or permissions to the auth object.
    // i will keep it for now, because it is a good practice to have a separate auth object on the request
    //  instead of putting the user directly on req.user. This way, if we want to add more auth-related info in the future, 
    // we can do it without changing the structure of req.user.
    userId: user.id,
    sessionId: decoded.sid,
    tokenId: decoded.jti,
  };

  req.user = user;

  return next();
}
