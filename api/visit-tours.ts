// Doodates Tours API — CRUD visites (guide only)
// POST /api/visit-tours — créer visite (guide)
// GET /api/visit-tours — lister visites (public: future only; guide: tous)
// PUT /api/visit-tours/{id} — modifier visite (guide)
// GET /api/visit-tours?action=guide-names — liste des prénoms de guides (guide ou admin)
// PUT /api/visit-tours?action=guide-names — remplacer cette liste (admin)

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbTourCreate, rtdbTourGet, rtdbTourUpdate, rtdbToursListFuture, rtdbToursListAll, rtdbGuideCodeValidate, rtdbCountRegisteredByTour, rtdbCountWaitlistedPlaces, rtdbGuideNamesGet, rtdbGuideNamesSet } from "./_visit-db.js";
import { isAdminRequest } from "./_admin.js";
import { promoteWaitlist } from "./visit-register.js";
import { Tour, TourCreateInput, bookableCapacity } from "../src/types/visitTypes.js";
import { locations } from "../src/data/locations.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Coordonnées x/y sur la carte custom Île Feydeau (pixels). Bornes généreuses.
const COORD_MAX = 5000;

// Toutes les visites partent du même bâtiment fixe — pas de choix guide.
const FIXED_START_LOCATION_ID = "allee-duguay-trouin-17";
function fixedStartLocation() {
  const loc = locations.find((l) => l.id === FIXED_START_LOCATION_ID);
  return {
    startLocationId: FIXED_START_LOCATION_ID,
    startLocationName: loc?.name || FIXED_START_LOCATION_ID,
    startLocationX: loc?.x ?? 0,
    startLocationY: loc?.y ?? 0,
  };
}

// Helper: validate guide code from header
async function validateGuideCode(code: string | undefined): Promise<boolean> {
  if (!code) return false;
  return rtdbGuideCodeValidate(code);
}

// Helper: is user authenticated as guide
async function isGuide(req: VercelRequest): Promise<boolean> {
  const code = req.headers["x-guide-code"] as string | undefined;
  return validateGuideCode(code);
}

const MAX_GUIDES_PER_TOUR = 6;
// Borne haute du surbooking. Au-delà, ce n'est plus compenser l'absentéisme
// mais promettre des places qui n'existent pas.
const MAX_OVERBOOKING_SEATS = 50;
const MAX_GUIDE_NAME_LENGTH = 40;

// Normalise une liste de prénoms : trim, longueur bornée, sans doublon (casse ignorée).
// Retourne null si l'entrée n'est pas un tableau de chaînes.
function normalizeGuideNames(input: unknown, max: number): string[] | null {
  if (!Array.isArray(input) || input.some((n) => typeof n !== "string")) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input as string[]) {
    const name = raw.trim().slice(0, MAX_GUIDE_NAME_LENGTH);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, max);
}

function isValidOverbooking(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_OVERBOOKING_SEATS;
}

// Le formulaire renvoie toujours tous les champs, y compris ceux que le guide
// n'a pas touchés. Une comparaison brute (JSON.stringify) voyait un changement
// là où il n'y en a pas — une visite sans surbooking enregistré (champ absent)
// contre le « 0 » du formulaire, un champ vide contre un champ absent, une date
// identique à la seconde près — et le gel J-1 refusait alors jusqu'aux
// corrections de texte. On compare donc les valeurs par leur sens.
function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function isSameFieldValue(field: string, next: unknown, prev: unknown): boolean {
  if (isUnset(next) && isUnset(prev)) return true;
  if (field === "date") {
    const a = new Date(next as string).getTime();
    const b = new Date(prev as string).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  // Champs numériques : un champ absent vaut 0 (surbooking non renseigné).
  if (field === "durationMinutes" || field === "capacity" || field === "overbookingSeats") {
    return Number(next ?? 0) === Number(prev ?? 0);
  }
  return JSON.stringify(next) === JSON.stringify(prev);
}

// Validate tour input
function validateTourInput(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.title || typeof data.title !== "string" || data.title.trim().length === 0) {
    errors.push("title: string required");
  }
  if (!data.date || typeof data.date !== "string") {
    errors.push("date: ISO datetime required");
  } else {
    const d = new Date(data.date);
    if (isNaN(d.getTime())) errors.push("date: invalid ISO datetime");
    else if (d < new Date()) errors.push("date: must be future");
  }
  if (!Number.isFinite(data.durationMinutes) || data.durationMinutes < 1) {
    errors.push("durationMinutes: number >= 1 required");
  }
  if (data.startLocationX !== undefined && (!Number.isFinite(data.startLocationX) || data.startLocationX < 0 || data.startLocationX > COORD_MAX)) {
    errors.push(`startLocationX: number in [0, ${COORD_MAX}] required`);
  }
  if (data.startLocationY !== undefined && (!Number.isFinite(data.startLocationY) || data.startLocationY < 0 || data.startLocationY > COORD_MAX)) {
    errors.push(`startLocationY: number in [0, ${COORD_MAX}] required`);
  }
  if (!Number.isFinite(data.capacity) || data.capacity < 1) {
    errors.push("capacity: number >= 1 required");
  }
  if (data.overbookingSeats !== undefined && !isValidOverbooking(data.overbookingSeats)) {
    errors.push(`overbookingSeats: integer in [0, ${MAX_OVERBOOKING_SEATS}] required`);
  }
  if (!Array.isArray(data.labels)) {
    errors.push("labels: array required");
  } else {
    for (const label of data.labels) {
      if (typeof label !== "string") errors.push("labels: all must be strings");
    }
  }

  return { valid: errors.length === 0, errors };
}

// POST /api/visit-tours — créer visite
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const guideCode = req.headers["x-guide-code"] as string | undefined;
  const isGuideUser = await isGuide(req);

  if (!isGuideUser) {
    return res.status(401).json({ error: "guide code required" });
  }

  const { title, description, date, durationMinutes, capacity, labels, overbookingSeats } = req.body;
  const validation = validateTourInput(req.body);

  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }
  const guides = req.body.guides === undefined ? [] : normalizeGuideNames(req.body.guides, MAX_GUIDES_PER_TOUR);
  if (guides === null) {
    return res.status(400).json({ errors: ["guides: array of strings required"] });
  }

  try {
    const input: TourCreateInput = {
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      date,
      durationMinutes,
      ...fixedStartLocation(),
      capacity,
      ...(overbookingSeats ? { overbookingSeats } : {}),
      labels: labels.map((l: string) => l.trim()),
      ...(guides.length > 0 ? { guides } : {}),
      guideId: "all-guides",
      status: "upcoming",
    };

    const tour = await rtdbTourCreate(input);
    return res.status(201).json(tour);
  } catch (e) {
    console.error("[visit-tours POST]", e);
    return res.status(500).json({ error: "creation failed" });
  }
}

// GET /api/visit-tours — lister visites
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const guideCode = req.headers["x-guide-code"] as string | undefined;
  const isGuideUser = await isGuide(req);

  // Un code fourni mais invalide/expiré → 401 explicite. Sans ça : (a) l'écran
  // de connexion guide acceptait n'importe quel code (le GET répondait 200 avec
  // la liste publique), (b) un code expiré en cours de session passait inaperçu.
  if (guideCode && !isGuideUser) {
    return res.status(401).json({ error: "invalid guide code" });
  }

  try {
    let tours: Tour[];
    if (isGuideUser) {
      // Guide voit tous tours (past + future)
      tours = await rtdbToursListAll();
    } else {
      // Public voit uniquement visites futures
      tours = await rtdbToursListFuture();
    }

    // Places restantes = capacité - places occupées - TOUTE la file d'attente non
    // rejetée (même règle que hasSpace côté inscription). En ne soustrayant que
    // les offres en cours, l'UI affichait « 1 place restante » alors que la
    // soumission partait en file d'attente.
    const enriched = await Promise.all(
      tours.map(async (t) => {
        const taken = await rtdbCountRegisteredByTour(t.id);
        const waitlisted = await rtdbCountWaitlistedPlaces(t.id);
        // Firebase ne stocke pas les tableaux vides → labels peut être undefined
        // Les noms des guides sont internes : jamais exposés au public.
        const { guides, ...rest } = t;
        return {
          ...rest,
          ...(isGuideUser ? { guides: guides || [] } : {}),
          labels: t.labels || [],
          placesLeft: Math.max(0, bookableCapacity(t) - taken - waitlisted),
          // Nombre de personnes en attente — un simple compte, sans la moindre
          // donnée nominative. Affiché au public à dessein : savoir que
          // quelqu'un attend sa place transforme le désistement en geste utile
          // plutôt qu'en aveu, et c'est le levier anti-absentéisme le moins
          // coûteux dont on dispose.
          waitlistCount: waitlisted,
        };
      })
    );

    // Cache uniquement la réponse publique. Vary sépare les entrées edge par
    // code guide ; le front guide utilise en plus ?guide=1 (URL distincte) pour
    // ne jamais recevoir l'entrée publique cachée.
    res.setHeader("Vary", "x-guide-code");
    if (isGuideUser) {
      res.setHeader("Cache-Control", "private, no-store");
    } else {
      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=3600");
    }

    return res.status(200).json(enriched);
  } catch (e) {
    console.error("[visit-tours GET]", e);
    return res.status(500).json({ error: "list failed" });
  }
}

// PUT /api/visit-tours/{id} — modifier visite
async function handlePut(req: VercelRequest, res: VercelResponse) {
  const guideCode = req.headers["x-guide-code"] as string | undefined;
  const isGuideUser = await isGuide(req);

  if (!isGuideUser) {
    return res.status(401).json({ error: "guide code required" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "tour id required" });
  }

  try {
    const tour = await rtdbTourGet(id);
    if (!tour) {
      return res.status(404).json({ error: "tour not found" });
    }

    // Restriction: pas modifier si J-1 ou après (Q11 invalidate post-season)
    const now = new Date();
    const tourStart = new Date(tour.date);
    const diffMs = tourStart.getTime() - now.getTime();
    const hoursUntilStart = diffMs / (60 * 60 * 1000);

    // Whitelist des champs modifiables — le corps était fusionné tel quel dans
    // le document (id, deletedAt, batchDeleteExecuted… écrasables).
    const ALLOWED_FIELDS = ["title", "description", "date", "durationMinutes", "capacity", "overbookingSeats", "labels", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    // Seuls les champs publics sont gelés à J-1 : un remplacement de guide de
    // dernière minute doit rester possible (les « guides » sont internes).
    // L'intitulé et le descriptif restent modifiables : corriger un texte
    // n'impacte pas les inscrits (horaire, durée, capacité inchangés), alors
    // que c'est justement la veille et le jour même qu'un guide relit sa fiche.
    const EDITORIAL_FIELDS: string[] = ["title", "description"];
    const FROZEN_FIELDS = ALLOWED_FIELDS.filter((f) => !EDITORIAL_FIELDS.includes(f));
    const publicFieldChanged = FROZEN_FIELDS.some(
      (f) => updates[f] !== undefined && !isSameFieldValue(f, updates[f], (tour as any)[f])
    );
    if (hoursUntilStart < 24 && publicFieldChanged) {
      return res.status(400).json({ error: "cannot modify within 24h of start" });
    }
    if (req.body.guides !== undefined) {
      const guides = normalizeGuideNames(req.body.guides, MAX_GUIDES_PER_TOUR);
      if (guides === null) {
        return res.status(400).json({ error: "guides: array of strings required" });
      }
      updates.guides = guides;
    }
    if (updates.title !== undefined && (typeof updates.title !== "string" || !updates.title.trim())) {
      return res.status(400).json({ error: "title: non-empty string required" });
    }
    if (updates.durationMinutes !== undefined && (!Number.isFinite(updates.durationMinutes) || updates.durationMinutes < 1)) {
      return res.status(400).json({ error: "durationMinutes: number >= 1 required" });
    }
    if (updates.labels !== undefined && (!Array.isArray(updates.labels) || updates.labels.some((l: unknown) => typeof l !== "string"))) {
      return res.status(400).json({ error: "labels: array of strings required" });
    }
    if (updates.status !== undefined && !["upcoming", "ongoing", "completed"].includes(updates.status)) {
      return res.status(400).json({ error: "status: invalid value" });
    }
    if (updates.date !== undefined) {
      const newDate = new Date(updates.date);
      if (isNaN(newDate.getTime())) {
        return res.status(400).json({ error: "date: invalid ISO datetime" });
      }
      if (newDate < new Date()) {
        return res.status(400).json({ error: "date: must be future" });
      }
    }
    if (updates.capacity !== undefined) {
      if (!Number.isFinite(updates.capacity) || updates.capacity < 1) {
        return res.status(400).json({ error: "capacity: number >= 1 required" });
      }
    }
    if (updates.overbookingSeats !== undefined && !isValidOverbooking(updates.overbookingSeats)) {
      return res.status(400).json({ error: `overbookingSeats: integer in [0, ${MAX_OVERBOOKING_SEATS}] required` });
    }
    await rtdbTourUpdate(id, updates);

    // Le nombre de places ouvertes dépend de la capacité ET du surbooking : les
    // deux doivent être pris en compte ensemble, sinon réduire le surbooking
    // tout en augmentant la capacité passerait inaperçu.
    const placesAvant = bookableCapacity(tour);
    const placesApres = bookableCapacity({ ...tour, ...updates } as Tour);

    // Spec §9 : places ouvertes passées sous le nombre d'inscrits → avertir le
    // guide, sans jamais désinscrire personne automatiquement.
    let warning: string | undefined;
    if (placesApres < placesAvant) {
      const confirmedCount = await rtdbCountRegisteredByTour(id);
      if (placesApres < confirmedCount) {
        warning = `Places ouvertes (${placesApres}) < inscrits confirmés (${confirmedCount}). ${confirmedCount - placesApres} personne(s) en surnombre — à gérer manuellement (annuler des inscriptions).`;
      }
    }

    // Places ouvertes en plus : proposer immédiatement à la file d'attente.
    // Un seul appel suffit, promoteWaitlist remplit tous les sièges libres.
    if (placesApres > placesAvant) {
      await promoteWaitlist(id);
    }

    return res.status(200).json({ ok: true, ...(warning ? { warning } : {}) });
  } catch (e) {
    console.error("[visit-tours PUT]", e);
    return res.status(500).json({ error: "update failed" });
  }
}

// GET/PUT /api/visit-tours?action=guide-names — liste des prénoms de guides.
// Lecture : guide ou admin. Écriture : admin uniquement.
async function handleGuideNames(req: VercelRequest, res: VercelResponse) {
  const isAdmin = isAdminRequest(req);
  try {
    if (req.method === "GET") {
      if (!isAdmin && !(await isGuide(req))) {
        return res.status(401).json({ error: "guide code or admin token required" });
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ names: await rtdbGuideNamesGet() });
    }
    if (req.method === "PUT") {
      if (!isAdmin) {
        return res.status(401).json({ error: "admin token required" });
      }
      const names = normalizeGuideNames(req.body?.names, 50);
      if (names === null) {
        return res.status(400).json({ error: "names: array of strings required" });
      }
      await rtdbGuideNamesSet(names);
      return res.status(200).json({ names });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("[visit-tours guide-names]", e);
    return res.status(500).json({ error: "guide names failed" });
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.action === "guide-names") {
    return handleGuideNames(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  } else if (req.method === "GET") {
    return handleGet(req, res);
  } else if (req.method === "PUT") {
    return handlePut(req, res);
  } else {
    return res.status(405).json({ error: "method not allowed" });
  }
}
