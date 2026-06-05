// Token magique signé pour l'édition artiste. Sans état, vérifié par HMAC.
// Format: base64url("artistId|email|exp") + "." + base64url(HMAC_SHA256(payload, secret))

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function secret(): string {
  const s = process.env.ARTIST_SECRET;
  if (!s) throw new Error("ARTIST_SECRET manquant");
  return s;
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function createToken(artistId: string, email: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${artistId}|${email}|${exp}`;
  return `${b64url(payload)}.${sign(payload)}`;
}

export type TokenResult =
  | { valid: true; expired: false; artistId: string; email: string }
  | { valid: true; expired: true; artistId: string; email: string }
  | { valid: false };

// Vérifie la signature, puis l'expiration. Si la signature est valide mais expirée,
// renvoie expired:true avec artistId/email (pour pré-remplir l'écran « lien expiré »).
export function verifyToken(token: string): TokenResult {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return { valid: false };

    const payload = fromB64url(payloadB64).toString("utf8");
    const expectedSig = sign(payload);
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };

    const [artistId, email, expStr] = payload.split("|");
    if (!artistId || !email || !expStr) return { valid: false };

    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return { valid: false };

    if (Date.now() >= exp) return { valid: true, expired: true, artistId, email };
    return { valid: true, expired: false, artistId, email };
  } catch {
    return { valid: false };
  }
}
