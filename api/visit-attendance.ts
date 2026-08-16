// Doodates Attendance API — Appel + marquage présences (guide only)
// POST /api/visit-attendance — marquer présent/absent (guide)
// GET /api/visit-attendance?tourId=... — lister présences (guide)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbAttendanceUpsert,
  rtdbAttendanceListByTour,
  rtdbRegistrationGet,
  rtdbRegistrationUpdate,
  rtdbRegistrationsListByTour,
  rtdbGuideCodeValidate,
} from "./_visit-db.js";
import { placesOf, Registration } from "../src/types/visitTypes.js";

// Une inscription annulée, supprimée (RGPD) ou en attente expirée n'occupe pas
// de place : elle ne doit ni apparaître sur la feuille d'appel, ni être marquable
// (le marquage écrasait « annulé » → « présent » alors que la place avait pu
// être réattribuée à la file d'attente).
function holdsSeat(reg: Registration, now: number): boolean {
  if (reg.deletedAt) return false;
  if (reg.status === "confirmé" || reg.status === "présent" || reg.status === "absent") return true;
  if (reg.status === "attente_validation") {
    return Boolean(reg.validationExpiresAt && new Date(reg.validationExpiresAt).getTime() > now);
  }
  return false;
}

// Helper: validate guide code
async function validateGuideCode(code: string | undefined): Promise<boolean> {
  if (!code) return false;
  return rtdbGuideCodeValidate(code);
}

// Helper: check guide auth
async function requireGuideCode(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const code = req.headers["x-guide-code"] as string | undefined;
  const valid = await validateGuideCode(code);

  if (!valid) {
    res.status(401).json({ error: "guide code required in x-guide-code header" });
    return false;
  }

  return true;
}

// POST /api/visit-attendance — marquer présent/absent
async function handleMarkAttendance(req: VercelRequest, res: VercelResponse) {
  // Validate guide auth
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  const { registrationId, tourId, present } = req.body;

  if (!registrationId || typeof registrationId !== "string") {
    return res.status(400).json({ error: "registrationId: string required" });
  }

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId: string required" });
  }

  if (typeof present !== "boolean") {
    return res.status(400).json({ error: "present: boolean required" });
  }

  try {
    const reg = await rtdbRegistrationGet(registrationId);

    if (!reg || reg.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }

    if (reg.tourId !== tourId) {
      return res.status(400).json({ error: "registration does not belong to this tour" });
    }

    if (!holdsSeat(reg, Date.now())) {
      return res.status(409).json({ error: `cannot mark attendance: registration is "${reg.status}"` });
    }

    // Create/update attendance record (un seul par inscription)
    const attendance = await rtdbAttendanceUpsert({
      registrationId,
      tourId,
      present: Boolean(present),
      markedAt: new Date().toISOString(),
      markedByGuide: "all-guides", // Anonymous
    });

    // Update registration status
    const newStatus = present ? "présent" : "absent";
    await rtdbRegistrationUpdate(registrationId, {
      status: newStatus,
      attendedAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      attendance,
      message: `Marked as ${newStatus}`,
    });
  } catch (e) {
    console.error("[visit-attendance POST]", e);
    return res.status(500).json({ error: "attendance marking failed" });
  }
}

// GET /api/visit-attendance?tourId=... — lister présences
async function handleListAttendance(req: VercelRequest, res: VercelResponse) {
  // Validate guide auth
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  const { tourId } = req.query;

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId: string required" });
  }

  try {
    // Get all registrations for tour
    const registrations = await rtdbRegistrationsListByTour(tourId);

    // Get all attendance records for tour
    const attendance = await rtdbAttendanceListByTour(tourId);

    // Index attendance by registrationId for quick lookup
    const attendanceMap = new Map();
    for (const att of attendance) {
      attendanceMap.set(att.registrationId, att);
    }

    // Enrich registrations with attendance data.
    // Seules les inscriptions occupant une place sont renvoyées (annulés et
    // attentes expirées exclus : ils polluaient feuille d'appel, CSV, impression
    // et compteurs). Les tokens de validation ne sortent pas du serveur.
    const now = Date.now();
    const enriched = registrations
      .filter((r) => holdsSeat(r, now))
      .map((r) => {
        const att = attendanceMap.get(r.id);
        const { validationToken, ...safe } = r as Registration & { validationToken?: string };
        return {
          ...safe,
          attendance: att || null,
          markedPresent: att?.present ?? null,
        };
      });

    // Sort by lastName, firstName
    enriched.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName);
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
    });

    // Comptages en PERSONNES (place = titulaire + accompagnants), cohérent avec la capacité.
    const sumPlaces = (arr: typeof enriched) => arr.reduce((s, r) => s + placesOf(r), 0);
    const counts = {
      total: enriched.length, // nb d'inscriptions occupant une place (lignes)
      totalPeople: sumPlaces(enriched.filter((r) => r.status === "confirmé" || r.status === "présent")),
      confirmed: sumPlaces(enriched.filter((r) => r.status === "confirmé")),
      present: sumPlaces(enriched.filter((r) => r.markedPresent === true)),
      absent: sumPlaces(enriched.filter((r) => r.markedPresent === false)),
      unmarked: sumPlaces(
        enriched.filter((r) => r.markedPresent === null && (r.status === "confirmé" || r.status === "présent"))
      ),
    };

    return res.json({
      tourId,
      counts,
      registrations: enriched,
    });
  } catch (e) {
    console.error("[visit-attendance GET]", e);
    return res.status(500).json({ error: "list failed" });
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    return handleMarkAttendance(req, res);
  } else if (req.method === "GET") {
    return handleListAttendance(req, res);
  } else {
    return res.status(405).json({ error: "method not allowed" });
  }
}
