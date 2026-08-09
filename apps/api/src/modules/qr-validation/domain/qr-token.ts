import { createHmac, timingSafeEqual } from "node:crypto";

export interface QrPayload {
  version: 1;
  tenantId: string;
  siteId: string;
  checkpointId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

interface SignedQrToken {
  payload: QrPayload;
  signature: string;
}

function canonicalize(payload: QrPayload): string {
  // Orden de claves fijo (no alfabetico) para que el payload sea legible,
  // pero determinista: la firma siempre se calcula sobre el mismo string.
  return JSON.stringify({
    version: payload.version,
    tenantId: payload.tenantId,
    siteId: payload.siteId,
    checkpointId: payload.checkpointId,
    nonce: payload.nonce,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  });
}

export function signQrPayload(payload: QrPayload, secret: string): string {
  return createHmac("sha256", secret).update(canonicalize(payload)).digest("hex");
}

// El token que se codifica en el QR (o se ingresa manualmente) es el
// payload + firma, en base64url — no solo el id del viaje/checkpoint.
export function encodeQrToken(payload: QrPayload, secret: string): string {
  const signature = signQrPayload(payload, secret);
  const raw: SignedQrToken = { payload, signature };
  return Buffer.from(JSON.stringify(raw), "utf8").toString("base64url");
}

export function decodeQrToken(token: string): SignedQrToken | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as SignedQrToken;
    if (!parsed.payload || !parsed.signature) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyQrToken(token: string, secret: string): { valid: boolean; payload?: QrPayload } {
  const decoded = decodeQrToken(token);
  if (!decoded) return { valid: false };

  const expectedSignature = signQrPayload(decoded.payload, secret);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const actualBuffer = Buffer.from(decoded.signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { valid: false };
  }

  return { valid: true, payload: decoded.payload };
}
