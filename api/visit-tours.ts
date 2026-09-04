// Doodates Tours API — CRUD visites (guide only)
// POST /api/visit-tours — créer visite (guide)
// GET /api/visit-tours — lister visites (public: future only; guide: tous)
// PUT /api/visit-tours/{id} — modifier visite (guide)

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbTourCreate, rtdbTourGet, rtdbTourUpdate, rtdbToursListFuture, rtdbToursListAll, rtdbGuideCodeValidate, rtdbCountRegisteredByTour, rtdbCountWaitlistedPlaces } from "./_visit-db.js";
import { promoteWaitlist } from "./visit-register.js";
import { Tour, TourCreateInput } from "../src/types/visitTypes.js";
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

  const { title, description, date, durationMinutes, capacity, labels } = req.body;
  const validation = validateTourInput(req.body);

  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }

  try {
    const input: TourCreateInput = {
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      date,
      durationMinutes,
      ...fixedStartLocation(),
      capacity,
      labels: labels.map((l: string) => l.trim()),
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
        return { ...t, labels: t.labels || [], placesLeft: Math.max(0, t.capacity - taken - waitlisted) };
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

    if (hoursUntilStart < 24) {
      return res.status(400).json({ error: "cannot modify within 24h of start" });
    }

    // Whitelist des champs modifiables — le corps était fusionné tel quel dans
    // le document (id, deletedAt, batchDeleteExecuted… écrasables).
    const ALLOWED_FIELDS = ["title", "description", "date", "durationMinutes", "capacity", "labels", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
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
    await rtdbTourUpdate(id, updates);

    // Spec §9: capacity reduced below confirmed count → warn guide (no auto-removal).
    let warning: string | undefined;
    if (updates.capacity !== undefined && updates.capacity < tour.capacity) {
      const confirmedCount = await rtdbCountRegisteredByTour(id);
      if (updates.capacity < confirmedCount) {
        warning = `Nouvelle capacité (${updates.capacity}) < inscrits confirmés (${confirmedCount}). ${confirmedCount - updates.capacity} personne(s) en surnombre — à gérer manuellement (annuler des inscriptions).`;
      }
    }

    // Capacity increase: promote waitlist (immediate, not batch)
    if (updates.capacity !== undefined && updates.capacity > tour.capacity) {
      const newPlaces = updates.capacity - tour.capacity;
      for (let i = 0; i < newPlaces; i++) {
        await promoteWaitlist(id);
      }
    }

    return res.status(200).json({ ok: true, ...(warning ? { warning } : {}) });
  } catch (e) {
    console.error("[visit-tours PUT]", e);
    return res.status(500).json({ error: "update failed" });
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
