// Token magique signé HMAC. Sans état, vérifié par signature. Support 2 secret keys.
// Format: base64url("id|email|exp") + "." + base64url(HMAC_SHA256(payload, secret))
// Utilisé par: artiste (30j) et registrations visit (24H)

import { createHmac, timingSafeEqual } from "crypto";

const ARTIST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const REGISTRATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24H Q1, Q2

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function getSecret(type: "artist" | "registration"): string {
  if (type === "artist") {
    const s = process.env.ARTIST_SECRET;
    if (!s) throw new Error("ARTIST_SECRET manquant");
    return s;
  } else {
    const s = process.env.REGISTRATION_SECRET;
    if (!s) throw new Error("REGISTRATION_SECRET manquant");
    return s;
  }
}

function sign(payload: string, secretType: "artist" | "registration"): string {
  return b64url(createHmac("sha256", getSecret(secretType)).update(payload).digest());
}

// Artiste: 30j TTL (legacy)
export function createToken(artistId: string, email: string): string {
  const exp = Date.now() + ARTIST_TOKEN_TTL_MS;
  const payload = `${artistId}|${email}|${exp}`;
  return `${b64url(payload)}.${sign(payload, "artist")}`;
}

export type TokenResult =
  | { valid: true; expired: false; artistId: string; email: string }
  | { valid: true; expired: true; artistId: string; email: string }
  | { valid: false };

// Artiste: vérifier token avec secret artiste
export function verifyToken(token: string): TokenResult {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return { valid: false };

    const payload = fromB64url(payloadB64).toString("utf8");
    const expectedSig = sign(payload, "artist");
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

// Registration: créer token 24H (Q1 idempotency + Q2 retry)
export interface RegistrationToken {
  token: string;
  expiresAt: string;
}

export function createRegistrationToken(registrationId: string, email: string): RegistrationToken {
  const exp = Date.now() + REGISTRATION_TOKEN_TTL_MS;
  const payload = `${registrationId}|${email}|${exp}`;
  const token = `${b64url(payload)}.${sign(payload, "registration")}`;
  return { token, expiresAt: new Date(exp).toISOString() };
}

export type RegistrationTokenResult =
  | { valid: true; expired: false; registrationId: string; email: string }
  | { valid: true; expired: true; registrationId: string; email: string }
  | { valid: false };

// Registration: vérifier token avec secret registration
export function verifyRegistrationToken(token: string): RegistrationTokenResult {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return { valid: false };

    const payload = fromB64url(payloadB64).toString("utf8");
    const expectedSig = sign(payload, "registration");
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };

    const [registrationId, email, expStr] = payload.split("|");
    if (!registrationId || !email || !expStr) return { valid: false };

    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return { valid: false };

    if (Date.now() >= exp) return { valid: true, expired: true, registrationId, email };
    return { valid: true, expired: false, registrationId, email };
  } catch {
    return { valid: false };
  }
}
