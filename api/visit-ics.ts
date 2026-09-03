// GET /api/visit-ics?id=<registrationId> — télécharge le fichier .ics de la visite confirmée.

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbRegistrationGet, rtdbTourGet } from "./_visit-db.js";
import { buildIcs } from "./_ics.js";

const MEETING_ADDRESS = "17 allée Duguay Trouin, Île Feydeau, 44000 Nantes";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const id = req.query.id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id: string required" });
  }

  try {
    const registration = await rtdbRegistrationGet(id);
    if (!registration || registration.status !== "confirmé") {
      return res.status(404).json({ error: "registration not found" });
    }

    const tour = await rtdbTourGet(registration.tourId);
    if (!tour) {
      return res.status(404).json({ error: "tour not found" });
    }

    const ics = buildIcs({
      uid: registration.id,
      title: tour.title,
      description: tour.description,
      location: tour.startLocationName
        ? `${tour.startLocationName}, ${MEETING_ADDRESS}`
        : MEETING_ADDRESS,
      startIso: tour.date,
      durationMinutes: tour.durationMinutes,
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="visite-feydeau.ics"`);
    return res.status(200).send(ics);
  } catch (e) {
    console.error("[visit-ics]", e);
    return res.status(500).json({ error: "ics generation failed" });
  }
}
