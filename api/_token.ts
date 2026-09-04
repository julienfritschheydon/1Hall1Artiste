// Token magique signé HMAC. Sans état, vérifié par signature. Support 2 secret keys.
// Format: base64url("id[,id2,...]|email|exp") + "." + base64url(HMAC_SHA256(payload, secret))
// Un token artiste peut couvrir plusieurs fiches (même email inscrit plusieurs fois).
// Les artistId sont des slugs [a-z0-9-] : la virgule est donc un séparateur sûr, et un
// token legacy mono-fiche se relit tel quel comme une liste à un élément.
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

// Artiste: 30j TTL. Accepte une fiche unique ou la liste des fiches de l'email.
export function createToken(artistIds: string | string[], email: string): string {
  const ids = (Array.isArray(artistIds) ? artistIds : [artistIds]).filter(Boolean);
  if (ids.length === 0) throw new Error("createToken: aucune fiche");
  const exp = Date.now() + ARTIST_TOKEN_TTL_MS;
  const payload = `${ids.join(",")}|${email}|${exp}`;
  return `${b64url(payload)}.${sign(payload, "artist")}`;
}

// artistIds = toutes les fiches couvertes par le lien ; artistId = la première,
// conservée pour les appelants qui n'en gèrent qu'une.
export type TokenResult =
  | { valid: true; expired: false; artistId: string; artistIds: string[]; email: string }
  | { valid: true; expired: true; artistId: string; artistIds: string[]; email: string }
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

    const [idsPart, email, expStr] = payload.split("|");
    if (!idsPart || !email || !expStr) return { valid: false };

    const artistIds = idsPart.split(",").filter(Boolean);
    if (artistIds.length === 0) return { valid: false };
    const artistId = artistIds[0];

    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return { valid: false };

    if (Date.now() >= exp) return { valid: true, expired: true, artistId, artistIds, email };
    return { valid: true, expired: false, artistId, artistIds, email };
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
