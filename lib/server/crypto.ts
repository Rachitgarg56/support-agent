import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashWithSalt(value: string, salt: string) {
  return createHmac("sha256", salt).update(value).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createSignedValue(payload: string, secret: string) {
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySignedValue(value: string, secret: string) {
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const expected = createSignedValue(payload, secret);
  return safeEqual(value, expected) ? payload : null;
}
