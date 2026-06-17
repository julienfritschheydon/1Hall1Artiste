// Doodates Tours API — CRUD visites (guide only)
// POST /api/visit-tours — créer visite (guide)
// GET /api/visit-tours — lister visites (public: future only; guide: tous)
// PUT /api/visit-tours/{id} — modifier visite (guide)

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbTourCreate, rtdbTourGet, rtdbTourUpdate, rtdbToursListFuture, rtdbToursListAll, rtdbGuideCodeValidate } from "./_visit-db";
import { Tour, TourCreateInput } from "../src/types/visitTypes";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COORD_BOUNDS = { lat: [-90, 90], lng: [-180, 180] };

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
  if (!Number.isFinite(data.startLocationLat) || data.startLocationLat < COORD_BOUNDS.lat[0] || data.startLocationLat > COORD_BOUNDS.lat[1]) {
    errors.push(`startLocationLat: number in ${JSON.stringify(COORD_BOUNDS.lat)} required`);
  }
  if (!Number.isFinite(data.startLocationLng) || data.startLocationLng < COORD_BOUNDS.lng[0] || data.startLocationLng > COORD_BOUNDS.lng[1]) {
    errors.push(`startLocationLng: number in ${JSON.stringify(COORD_BOUNDS.lng)} required`);
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

  const { title, date, durationMinutes, startLocationLat, startLocationLng, capacity, labels } = req.body;
  const validation = validateTourInput(req.body);

  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }

  try {
    const input: TourCreateInput = {
      title: title.trim(),
      date,
      durationMinutes,
      startLocationLat,
      startLocationLng,
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

  try {
    let tours: Tour[];
    if (isGuideUser) {
      // Guide voit tous tours (past + future)
      tours = await rtdbToursListAll();
    } else {
      // Public voit uniquement visites futures
      tours = await rtdbToursListFuture();
    }

    return res.status(200).json(tours);
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

    // Validate partial updates
    const updates = req.body;
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
    if (updates.startLocationLat !== undefined) {
      if (!Number.isFinite(updates.startLocationLat) || updates.startLocationLat < -90 || updates.startLocationLat > 90) {
        return res.status(400).json({ error: "startLocationLat: invalid" });
      }
    }
    if (updates.startLocationLng !== undefined) {
      if (!Number.isFinite(updates.startLocationLng) || updates.startLocationLng < -180 || updates.startLocationLng > 180) {
        return res.status(400).json({ error: "startLocationLng: invalid" });
      }
    }

    await rtdbTourUpdate(id, updates);
    return res.status(200).json({ ok: true });
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
