import { Tour } from "@/types/visitTypes";

export interface TourTimeSlot {
  time: string; // "14:00"
  tours: Tour[];
}

export interface TourDayGroup {
  dayKey: string; // "2026-09-19"
  dayLabel: string; // "Samedi 19 septembre"
  slots: TourTimeSlot[];
}

// Regroupe une liste de visites par jour puis par créneau horaire, triés
// chronologiquement — évite d'afficher 24 cartes identiques à plat quand
// plusieurs visites partagent le même horaire (voir /reservations, /program,
// fiche bâtiment).
export function groupToursByDayAndTime(tours: Tour[]): TourDayGroup[] {
  const sorted = [...tours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const dayMap = new Map<string, Map<string, Tour[]>>();

  for (const tour of sorted) {
    const d = new Date(tour.date);
    const dayKey = d.toLocaleDateString("fr-CA"); // YYYY-MM-DD, stable comme clé
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    if (!dayMap.has(dayKey)) dayMap.set(dayKey, new Map());
    const slotMap = dayMap.get(dayKey)!;
    if (!slotMap.has(time)) slotMap.set(time, []);
    slotMap.get(time)!.push(tour);
  }

  return Array.from(dayMap.entries()).map(([dayKey, slotMap]) => {
    const firstTourOfDay = slotMap.values().next().value![0];
    const dayLabel = new Date(firstTourOfDay.date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return {
      dayKey,
      dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
      slots: Array.from(slotMap.entries()).map(([time, slotTours]) => ({ time, tours: slotTours })),
    };
  });
}
