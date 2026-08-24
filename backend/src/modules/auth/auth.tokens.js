import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "spotter-api";
const JWT_AUDIENCE = "spotter-api";
const ACCESS_TOKEN_TYPE = "access";

function requireIdentifier(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`A non-empty ${name} is required.`);
  }
}

// Access tokens are JWTs because API middleware must verify their claims.
export function createAccessToken({ userId, sessionId }) {
  requireIdentifier(userId, "user ID");
  requireIdentifier(sessionId, "session ID");

  return jwt.sign(
    {
      typ: ACCESS_TOKEN_TYPE,
      sid: sessionId,
    },
    env.ACCESS_TOKEN_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      subject: userId,
      jwtid: randomUUID(),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_EXPIRATION,
    }
  );
}

export function verifyAccessToken(token) {
  requireIdentifier(token, "access token");

  const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  // jsonwebtoken handles cryptographic checks and expiry. These checks enforce
  // the application-specific claims every Spotter access token must contain.
  if (
    typeof decoded !== "object" ||
    decoded.typ !== ACCESS_TOKEN_TYPE ||
    typeof decoded.sub !== "string" ||
    decoded.sub.length === 0 ||
    typeof decoded.sid !== "string" ||
    decoded.sid.length === 0 ||
    typeof decoded.jti !== "string" ||
    decoded.jti.length === 0 ||
    typeof decoded.iat !== "number" ||
    typeof decoded.exp !== "number" ||
    decoded.exp <= decoded.iat
  ) {
    throw new jwt.JsonWebTokenError("JWT claims are invalid.");
  }

  return decoded;
}

// Refresh tokens are opaque secrets. Only their hashes are stored in the DB.
export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(rawToken) {
  requireIdentifier(rawToken, "refresh token");

  return createHash("sha256")
    .update(rawToken)
    .digest("hex");
}
