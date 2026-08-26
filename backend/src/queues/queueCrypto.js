import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env.js";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

// HKDF gives queue encryption its own domain-separated key instead of using
// the JWT secret bytes directly as an AES key.
const ENCRYPTION_KEY = Buffer.from(
  hkdfSync(
    "sha256",
    Buffer.from(env.ACCESS_TOKEN_SECRET, "base64url"),
    Buffer.from("spotter-queue-payload-v1", "utf8"),
    Buffer.from("verification-email-token", "utf8"),
    32
  )
);

export function encryptQueueToken(rawToken) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptQueueToken(encryptedToken) {
  if (typeof encryptedToken !== "string") {
    throw new Error("Invalid encrypted queue token.");
  }

  const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] =
    encryptedToken.split(".");

  if (
    version !== VERSION ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedAuthTag ||
    extra !== undefined
  ) {
    throw new Error("Invalid encrypted queue token.");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");
  const authTag = Buffer.from(encodedAuthTag, "base64url");

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted queue token.");
  }

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
