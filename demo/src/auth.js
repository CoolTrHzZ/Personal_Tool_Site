/** Minimal JWT-shaped token helpers for demo purposes (not production crypto). */
export function createToken(payload, secret = "demo-secret") {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, secretHint: secret.slice(0, 2) })).toString("base64url");
  return `${header}.${body}.demo`;
}

export function verifyToken(token, secret = "demo-secret") {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    return { ok: false, error: "malformed" };
  }
  try {
    const body = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (body.secretHint !== secret.slice(0, 2)) {
      return { ok: false, error: "secret_mismatch" };
    }
    return { ok: true, payload: body };
  } catch {
    return { ok: false, error: "parse_error" };
  }
}
