// État d'une visite guidée dans le temps, partagé par le portail guide et la
// page publique : trois écrans affichaient trois vocabulaires différents pour
// la même visite, et une visite commencée continuait d'annoncer des places
// alors que l'API refuse toute inscription dès le départ donné
// (api/visit-register.ts).

import { Tour } from "@/types/visitTypes";

export type TourTimeStatus = "upcoming" | "ongoing" | "completed";

// « En cours » = entre le départ et la fin (départ + durée). L'ancien calcul
// exigeait une égalité à la milliseconde : une visite en train de se dérouler —
// le moment précis où le guide fait l'appel — s'affichait « Terminée ».
export function tourStatus(tour: Tour, now: number = Date.now()): TourTimeStatus {
  const start = new Date(tour.date).getTime();
  const end = start + (tour.durationMinutes || 0) * 60 * 1000;
  return now < start ? "upcoming" : now <= end ? "ongoing" : "completed";
}

export const TOUR_STATUS_LABELS: Record<TourTimeStatus, string> = {
  upcoming: "À venir",
  ongoing: "En cours",
  completed: "Terminée",
};

/** Inscription possible seulement avant le départ, comme côté serveur. */
export function isTourOpenForRegistration(tour: Tour, now: number = Date.now()): boolean {
  return tourStatus(tour, now) === "upcoming";
}

const SECTION_ORDER: TourTimeStatus[] = ["ongoing", "upcoming", "completed"];

const SECTION_TITLES: Record<TourTimeStatus, string> = {
  ongoing: "En cours",
  upcoming: "À venir",
  completed: "Passées",
};

export type TourSection = {
  status: TourTimeStatus;
  title: string;
  tours: Tour[];
};

/**
 * Regroupe les visites en sections « En cours », « À venir », « Passées »,
 * chacune triée chronologiquement. Les sections vides ne sont pas renvoyées.
 */
export function groupToursByStatus(tours: Tour[], now: number = Date.now()): TourSection[] {
  const byStatus = new Map<TourTimeStatus, Tour[]>();

  for (const tour of tours) {
    const status = tourStatus(tour, now);
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status)!.push(tour);
  }

  return SECTION_ORDER.filter((status) => byStatus.has(status)).map((status) => ({
    status,
    title: SECTION_TITLES[status],
    tours: [...byStatus.get(status)!].sort(
      // Les passées les plus récentes d'abord : c'est la visite qui vient de
      // finir que le guide rouvre, pas celle d'hier matin.
      (a, b) =>
        status === "completed"
          ? new Date(b.date).getTime() - new Date(a.date).getTime()
          : new Date(a.date).getTime() - new Date(b.date).getTime()
    ),
  }));
}
