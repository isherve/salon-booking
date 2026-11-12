import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Hash a password with scrypt (built into Node, no extra packages). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 200) return "Password is too long";
  return null;
}

/** Readable temporary password, e.g. "kite-4821-moss" */
export function tempPassword() {
  const words = ["sun", "kite", "moss", "river", "lime", "wave", "cedar", "maple", "pearl", "comet", "amber", "delta"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  return `${pick()}-${1000 + (randomBytes(2).readUInt16BE() % 9000)}-${pick()}`;
}
