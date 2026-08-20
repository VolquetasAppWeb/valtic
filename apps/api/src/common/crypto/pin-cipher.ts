import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

// Cifra el PIN del conductor para poder mostrarlo de nuevo despues (a
// diferencia del hash de argon2 usado para el login, que nunca se puede
// revertir). IV aleatorio por cada cifrado, guardado junto con el tag de
// autenticacion en el mismo string (base64), para no necesitar una columna
// aparte.
export function encryptPin(pin: string, key: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key, "utf8"), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptPin(payload: string, key: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key, "utf8"), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
