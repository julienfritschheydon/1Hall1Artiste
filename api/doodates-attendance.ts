// Doodates Attendance API — Appel + marquage présences (guide only)
// POST /api/doodates-attendance — marquer présent/absent (guide)
// GET /api/doodates-attendance?tourId=... — lister présences (guide)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbAttendanceCreate,
  rtdbAttendanceListByTour,
  rtdbRegistrationGet,
  rtdbRegistrationUpdate,
  rtdbRegistrationsListByTour,
  rtdbGuideCodeValidate,
} from "./_doodates-db";

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

// POST /api/doodates-attendance — marquer présent/absent
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

    if (!reg) {
      return res.status(404).json({ error: "registration not found" });
    }

    if (reg.tourId !== tourId) {
      return res.status(400).json({ error: "registration does not belong to this tour" });
    }

    // Create attendance record
    const attendance = await rtdbAttendanceCreate({
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
    console.error("[doodates-attendance POST]", e);
    return res.status(500).json({ error: "attendance marking failed" });
  }
}

// GET /api/doodates-attendance?tourId=... — lister présences
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

    // Enrich registrations with attendance data
    const enriched = registrations
      .filter((r) => !r.deletedAt) // Exclude soft-deleted
      .map((r) => {
        const att = attendanceMap.get(r.id);
        return {
          ...r,
          attendance: att || null,
          markedPresent: att?.present ?? null,
        };
      });

    // Sort by lastName, firstName
    enriched.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName);
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
    });

    // Count by status
    const counts = {
      total: registrations.length,
      confirmed: registrations.filter((r) => r.status === "confirmé").length,
      present: enriched.filter((r) => r.markedPresent === true).length,
      absent: enriched.filter((r) => r.markedPresent === false).length,
      unmarked: enriched.filter((r) => r.markedPresent === null).length,
    };

    return res.json({
      tourId,
      counts,
      registrations: enriched,
    });
  } catch (e) {
    console.error("[doodates-attendance GET]", e);
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
