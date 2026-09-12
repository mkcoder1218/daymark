import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signature(value: string) {
  return createHmac("sha256", jwtSecret()).update(value).digest("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createAccessToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { sub: userId, iat: now, exp: now + 60 * 60 * 24 * 30 };
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${signature(unsigned)}`;
}

export function verifyAccessToken(token: string) {
  const [header, body, receivedSignature] = token.split(".");
  if (!header || !body || !receivedSignature) throw new Error("Invalid token");
  const unsigned = `${header}.${body}`;
  const expected = Buffer.from(signature(unsigned));
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Invalid token");

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.exp !== "number" || payload.exp <= now) throw new Error("Token expired");
  return payload as TokenPayload;
}
