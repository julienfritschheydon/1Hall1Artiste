// Sync des favoris (événements + lieux) — snapshot par appareil anonyme.
//
// GET  ?deviceId=xxx  → { events, locations, updatedAt }
// GET  ?email=xxx     → { found, events, locations }  (union de tous les appareils associés)
// POST { deviceId, events, locations, email? } → { success }
// DELETE ?deviceId=xxx → dissocie l'email de l'appareil → { success }
//
// Modèle de menace assumé : écriture non authentifiée mais deviceId = UUID jamais
// publié (contrairement au sessionId des likes, exposé dans likedBy) ; pour la
// récupération, « le secret est l'email ». Voir plan de conception.
//
// RTDB : un tableau vide est stocké comme null → la clé disparaît. Toujours
// coercer avec Array.isArray côté lecture, jamais brancher sur « nœud absent ».

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbGet, rtdbPatch, rtdbDelete } from "./_firebase.js";
import { emailKey } from "./_visit-db.js";

const FAVORITES_PATH = "user-favorites";
const EMAIL_INDEX_PATH = "favorites-email-index";
const MAX_ITEMS = 300;

// IDs d'événements/lieux = slugs ([a-z0-9-]). Whitelist validante : on rejette
// l'élément invalide au lieu de le transformer (une transformation muette
// désynchroniserait l'ID du programme).
const ID_RE = /^[a-z0-9-]{1,80}$/;
// deviceId : UUID v4 ou fallback fav_<ts>_<rand> (contexte non sécurisé)
const DEVICE_ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|fav_[0-9]+_[a-z0-9]{1,16})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit best-effort PAR INSTANCE serverless uniquement (chaque instance a sa
// propre Map, les instances se multiplient/recyclent). Garde-fou anti-boucle,
// PAS une protection contre l'énumération distribuée — risque documenté.
const rateMap = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 30;
}

type FavoritesDoc = {
  events?: unknown;
  locations?: unknown;
  email?: string;
  updatedAt?: string;
};

type EmailIndexDoc = {
  email?: string;
  devices?: Record<string, string>;
};

function coerceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && ID_RE.test(v)).slice(0, MAX_ITEMS);
}

function setCors(res: VercelResponse): void {
  const origin = process.env.PUBLIC_SITE_URL || process.env.APP_BASE_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function handleGetByDevice(deviceId: string, res: VercelResponse) {
  const doc = await rtdbGet<FavoritesDoc>(`${FAVORITES_PATH}/${deviceId}`);
  return res.status(200).json({
    events: coerceIds(doc?.events),
    locations: coerceIds(doc?.locations),
    updatedAt: doc?.updatedAt || null,
  });
}

async function handleGetByEmail(rawEmail: string, res: VercelResponse) {
  const email = rawEmail.toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Email invalide" });

  const index = await rtdbGet<EmailIndexDoc>(`${EMAIL_INDEX_PATH}/${emailKey(email)}`);
  const deviceIds = index?.devices ? Object.keys(index.devices) : [];
  if (deviceIds.length === 0) {
    return res.status(200).json({ found: false, events: [], locations: [] });
  }

  // Union de tous les appareils associés — l'ordre des push devient indifférent.
  // La comparaison de l'email exact du doc neutralise collisions d'emailKey et
  // entrées d'index périmées.
  const events = new Set<string>();
  const locations = new Set<string>();
  let found = false;
  for (const deviceId of deviceIds) {
    if (!DEVICE_ID_RE.test(deviceId)) continue;
    const doc = await rtdbGet<FavoritesDoc>(`${FAVORITES_PATH}/${deviceId}`);
    if (!doc || doc.email !== email) continue;
    found = true;
    coerceIds(doc.events).forEach((id) => events.add(id));
    coerceIds(doc.locations).forEach((id) => locations.add(id));
  }

  return res.status(200).json({
    found,
    events: Array.from(events).slice(0, MAX_ITEMS),
    locations: Array.from(locations).slice(0, MAX_ITEMS),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  // sendBeacon peut arriver en text/plain → req.body est une string non parsée
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Body JSON invalide" });
    }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "Body requis" });

  const { deviceId, events, locations, email } = body as Record<string, unknown>;
  if (typeof deviceId !== "string" || !DEVICE_ID_RE.test(deviceId)) {
    return res.status(400).json({ error: "deviceId invalide" });
  }
  if (!Array.isArray(events) || !Array.isArray(locations)) {
    return res.status(400).json({ error: "events/locations doivent être des tableaux" });
  }
  if (events.length > MAX_ITEMS || locations.length > MAX_ITEMS) {
    return res.status(400).json({ error: `Maximum ${MAX_ITEMS} éléments` });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    events: coerceIds(events),
    locations: coerceIds(locations),
    updatedAt: now,
  };

  let normalizedEmail: string | null = null;
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || !EMAIL_RE.test(email.toLowerCase().trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }
    normalizedEmail = email.toLowerCase().trim();
    patch.email = normalizedEmail;
  }

  // PATCH : ne touche jamais le champ email sur un push anonyme (pas de
  // GET-before-PUT, pas de race sur l'email).
  await rtdbPatch(`${FAVORITES_PATH}/${deviceId}`, patch);

  if (normalizedEmail) {
    await rtdbPatch(`${EMAIL_INDEX_PATH}/${emailKey(normalizedEmail)}`, {
      email: normalizedEmail,
      [`devices/${deviceId}`]: now,
    });
  }

  return res.status(200).json({ success: true });
}

async function handleDelete(deviceId: string, res: VercelResponse) {
  if (!DEVICE_ID_RE.test(deviceId)) return res.status(400).json({ error: "deviceId invalide" });

  const doc = await rtdbGet<FavoritesDoc>(`${FAVORITES_PATH}/${deviceId}`);
  const email = typeof doc?.email === "string" ? doc.email : null;

  // Ordre : doc d'abord — un index orphelin pointe alors vers un doc sans email,
  // déjà rejeté par la vérification email-exact du recover.
  await rtdbPatch(`${FAVORITES_PATH}/${deviceId}`, { email: null });
  if (email) {
    await rtdbDelete(`${EMAIL_INDEX_PATH}/${emailKey(email)}/devices/${deviceId}`);
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: "Trop de requêtes" });

  try {
    if (req.method === "GET") {
      const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : "";
      const email = typeof req.query.email === "string" ? req.query.email : "";
      if (deviceId && DEVICE_ID_RE.test(deviceId)) return await handleGetByDevice(deviceId, res);
      if (email) return await handleGetByEmail(email, res);
      return res.status(400).json({ error: "deviceId ou email requis" });
    }
    if (req.method === "POST") return await handlePost(req, res);
    if (req.method === "DELETE") {
      const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : "";
      return await handleDelete(deviceId, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[favorites] erreur:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
