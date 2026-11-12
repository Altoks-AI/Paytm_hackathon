import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// ENCRYPTION_KEY: any long random string. Tenant credentials are encrypted at rest with AES-256-GCM.
const key = () => createHash("sha256").update(process.env.ENCRYPTION_KEY || "").digest();

export function encryptJson(value: unknown): string {
  if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not set");
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8"));
}
