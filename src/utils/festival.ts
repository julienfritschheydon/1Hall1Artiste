// Calcule automatiquement l'année et les dates du festival.
// Le festival a lieu le 3ᵉ week-end (samedi/dimanche) de septembre.
// L'année de l'édition suit l'année calendaire en cours (new Date().getFullYear()).

// Année de l'édition courante.
export function getFestivalYear(now: Date = new Date()): number {
  return now.getFullYear();
}

// Renvoie le samedi du 3ᵉ week-end de septembre pour une année donnée.
function thirdSeptemberSaturday(year: number): Date {
  // 1er septembre de l'année.
  const firstOfSeptember = new Date(year, 8, 1);
  const dayOfWeek = firstOfSeptember.getDay(); // 0 = dimanche, 6 = samedi
  // Décalage vers le premier samedi de septembre.
  const offsetToFirstSaturday = (6 - dayOfWeek + 7) % 7;
  const firstSaturday = 1 + offsetToFirstSaturday;
  // Le 3ᵉ samedi = premier samedi + 2 semaines.
  return new Date(year, 8, firstSaturday + 14);
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Dates (format YYYY-MM-DD) du week-end de festival pour l'année courante.
export function getFestivalDates(now: Date = new Date()): { samedi: string; dimanche: string } {
  const saturday = thirdSeptemberSaturday(getFestivalYear(now));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return {
    samedi: formatISODate(saturday),
    dimanche: formatISODate(sunday),
  };
}
