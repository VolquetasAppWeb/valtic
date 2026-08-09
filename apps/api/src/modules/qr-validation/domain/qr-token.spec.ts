import { decodeQrToken, encodeQrToken, signQrPayload, verifyQrToken, type QrPayload } from "./qr-token";

const SECRET = "test_qr_secret";

function buildPayload(overrides: Partial<QrPayload> = {}): QrPayload {
  return {
    version: 1,
    tenantId: "tenant-1",
    siteId: "site-1",
    checkpointId: "checkpoint-1",
    nonce: "abc123",
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_300_000,
    ...overrides,
  };
}

describe("signQrPayload", () => {
  it("es deterministica: la misma carga y secreto siempre producen la misma firma", () => {
    const payload = buildPayload();
    expect(signQrPayload(payload, SECRET)).toBe(signQrPayload(payload, SECRET));
  });

  it("produce firmas distintas para cargas distintas", () => {
    const a = signQrPayload(buildPayload({ nonce: "a" }), SECRET);
    const b = signQrPayload(buildPayload({ nonce: "b" }), SECRET);
    expect(a).not.toBe(b);
  });

  it("produce firmas distintas con secretos distintos", () => {
    const payload = buildPayload();
    expect(signQrPayload(payload, "secret-a")).not.toBe(signQrPayload(payload, "secret-b"));
  });
});

describe("encodeQrToken / decodeQrToken", () => {
  it("decodifica un token codificado y recupera exactamente el mismo payload", () => {
    const payload = buildPayload();
    const token = encodeQrToken(payload, SECRET);
    const decoded = decodeQrToken(token);
    expect(decoded?.payload).toEqual(payload);
    expect(decoded?.signature).toBe(signQrPayload(payload, SECRET));
  });

  it("retorna null para un token que no es base64url valido / JSON valido", () => {
    expect(decodeQrToken("no-es-un-token-valido-@@@")).toBeNull();
  });

  it("retorna null para un token bien formado pero sin payload o firma", () => {
    const malformed = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
    expect(decodeQrToken(malformed)).toBeNull();
  });
});

describe("verifyQrToken", () => {
  it("valida un token firmado correctamente con el secreto correcto", () => {
    const payload = buildPayload();
    const token = encodeQrToken(payload, SECRET);
    const result = verifyQrToken(token, SECRET);
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual(payload);
  });

  it("rechaza un token firmado con un secreto distinto", () => {
    const token = encodeQrToken(buildPayload(), "otro-secreto");
    const result = verifyQrToken(token, SECRET);
    expect(result.valid).toBe(false);
    expect(result.payload).toBeUndefined();
  });

  it("rechaza un token cuyo payload fue alterado despues de firmarlo (firma ya no coincide)", () => {
    const payload = buildPayload();
    const token = encodeQrToken(payload, SECRET);
    const decoded = decodeQrToken(token)!;

    const tamperedToken = Buffer.from(
      JSON.stringify({ payload: { ...decoded.payload, checkpointId: "checkpoint-attacker" }, signature: decoded.signature }),
      "utf8",
    ).toString("base64url");

    expect(verifyQrToken(tamperedToken, SECRET).valid).toBe(false);
  });

  it("rechaza un token malformado", () => {
    expect(verifyQrToken("basura", SECRET).valid).toBe(false);
  });
});
