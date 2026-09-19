// Regroupe les événements d'un lieu par jour de présence.
//
// Sur la fiche d'un bâtiment, les concerts d'un même groupe apparaissaient deux
// fois à l'identique (un événement par jour) sans qu'on puisse dire lequel était
// le samedi et lequel le dimanche. Les expositions présentes un seul jour
// posaient le même problème. On regroupe donc sous un en-tête explicite.

import { Event } from "@/data/events";

export type EventDayGroup = {
  key: "samedi" | "dimanche" | "les-deux";
  label: string;
  events: Event[];
};

const GROUP_ORDER: EventDayGroup["key"][] = ["les-deux", "samedi", "dimanche"];

const GROUP_LABELS: Record<EventDayGroup["key"], string> = {
  "les-deux": "Samedi et dimanche",
  samedi: "Samedi",
  dimanche: "Dimanche",
};

function groupKeyOf(event: Event): EventDayGroup["key"] {
  const samedi = event.days?.includes("samedi");
  const dimanche = event.days?.includes("dimanche");
  if (samedi && dimanche) return "les-deux";
  if (dimanche) return "dimanche";
  // Jours absents ou mal renseignés : on retombe sur samedi plutôt que de
  // masquer l'événement.
  return "samedi";
}

// Les horaires du Sheet sont au format "14:00 - 14:30" ou "12h00 - 19h00" :
// un tri alphabétique sur la chaîne suffit et reste stable si le format bouge.
function timeOf(event: Event): string {
  return (event.time || "").trim();
}

/**
 * L'horaire d'une exposition inclut déjà ses jours ("12h00 - 19h00, samedi").
 * Sous un en-tête de jour, cette répétition est du bruit : on ne garde que
 * la plage horaire.
 */
export function timeWithoutDays(time: string): string {
  return (time || "").split(",")[0].trim();
}

export function groupEventsByDay(events: Event[]): EventDayGroup[] {
  const groups = new Map<EventDayGroup["key"], Event[]>();

  for (const event of events) {
    const key = groupKeyOf(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  return GROUP_ORDER.filter((key) => groups.has(key)).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    events: [...groups.get(key)!].sort(
      (a, b) => timeOf(a).localeCompare(timeOf(b)) || a.title.localeCompare(b.title)
    ),
  }));
}
