// Logique pure des deux filtres de la page Programme (bouton Jour, bouton Type).
// Séparée du composant pour être testable sans React ni données distantes.

export type Day = "samedi" | "dimanche";

export const ALL_DAYS: Day[] = ["samedi", "dimanche"];

/** Valeur du filtre Type quand aucune catégorie n'est choisie. */
export const ALL_TYPES = "all";

const DAY_NAMES: Record<Day, string> = { samedi: "Samedi", dimanche: "Dimanche" };

/**
 * Coche ou décoche un jour. Le dernier jour coché ne peut pas être décoché :
 * une liste vide n'aurait aucun sens pour le visiteur.
 * Le résultat garde toujours l'ordre samedi → dimanche.
 */
export function toggleDay(selected: Day[], day: Day): Day[] {
  if (selected.includes(day)) {
    if (selected.length === 1) return selected;
    return selected.filter((d) => d !== day);
  }
  return ALL_DAYS.filter((d) => d === day || selected.includes(d));
}

/** Libellé du bouton Jour, reflet de la sélection en cours. */
export function dayLabel(selected: Day[]): string {
  if (selected.length !== 1) return "Les deux jours";
  return DAY_NAMES[selected[0]];
}

/** Libellé du bouton Type, reflet de la sélection en cours. */
export function typeLabel(filter: string): string {
  return filter && filter !== ALL_TYPES ? filter : "Tous les types";
}

/** Jours à afficher, dans l'ordre du week-end, avec ou sans en-tête de section. */
export function daySections(selected: Day[]): { day: Day; title: string | null }[] {
  const days = ALL_DAYS.filter((d) => selected.includes(d));
  return days.map((day) => ({ day, title: days.length > 1 ? DAY_NAMES[day] : null }));
}
