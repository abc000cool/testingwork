import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCHEME = "scrypt";

export const newId = (): string => randomUUID();

/** 256 bits of entropy, URL-safe. Used for opaque session tokens. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${SCHEME}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split("$");
  if (scheme !== SCHEME || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
