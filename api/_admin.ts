// Authentification admin côté serveur.
//
// Avant : le mot de passe était comparé dans le bundle client (AdminLogin.tsx), donc
// publié à chaque visiteur — et /api/artist-update acceptait n'importe quel
// { artistId, fields } sans aucune vérification. Il vit désormais dans ADMIN_PASSWORD
// (env Vercel, absent du bundle) et les routes admin exigent un token signé, émis par
// l'action « admin-login » de /api/artist-link.

import type { VercelRequest } from "@vercel/node";
import { createHash, timingSafeEqual } from "crypto";
import { verifyAdminToken } from "./_token.js";

// Rate limit best-effort PAR INSTANCE serverless (chaque instance a sa propre Map).
// Même motif que api/favorites.ts. Ce n'est pas une protection contre un forçage
// distribué : c'est ce qui le rend non trivial depuis une IP.
const attempts = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.reset) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers?.["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw || "").split(",")[0].trim() || "inconnue";
}

// Compare à durée constante. Renvoie false si ADMIN_PASSWORD n'est pas configuré : une
// variable manquante doit fermer la porte, jamais l'ouvrir.
//
// On compare des empreintes SHA-256 plutôt que les chaînes brutes : timingSafeEqual exige
// deux Buffers de même longueur, et sortir plus tôt sur une longueur différente révélerait
// la taille du mot de passe. Les empreintes font toujours 32 octets.
export function checkAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

// Extrait et vérifie le token admin d'une requête (body.adminToken ou en-tête Bearer).
export function isAdminRequest(req: VercelRequest): boolean {
  const fromBody = typeof req.body?.adminToken === "string" ? req.body.adminToken : "";
  // Optionnels tout du long : une requête mal formée doit produire un refus net,
  // pas une exception qui remonterait en 500.
  const auth = req.headers?.authorization || "";
  const fromHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = fromBody || fromHeader;
  return token ? verifyAdminToken(token) : false;
}
