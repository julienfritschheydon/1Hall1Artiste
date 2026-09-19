// État temporel d'un événement du programme (exposition ou concert).
//
// Les visites guidées portent une date ISO complète (cf. utils/tourStatus) ;
// les événements, eux, n'ont qu'un jour (« samedi ») et un horaire en texte
// libre venu du Google Sheet (« 14:00 - 14:30 », « 12h00 - 19h00, samedi »).
// On recompose ici un créneau réel à partir des dates du festival.
//
// Principe de prudence : si l'horaire est illisible ou si l'on n'est pas
// pendant le week-end du festival, on ne qualifie rien — l'affichage reste
// celui d'un catalogue. Un parsing raté ne doit jamais faire disparaître ni
// griser un événement.

import { Event } from "@/data/events";
import { getFestivalDates } from "@/utils/festival";
import type { Day } from "@/utils/programFilters";

export type EventTimeStatus =
  | "upcoming" // aujourd'hui, pas encore commencé
  | "ongoing" // en cours
  | "past" // terminé aujourd'hui, et ne revient pas
  | "tomorrow" // pas (ou plus) aujourd'hui, mais a lieu demain
  | "other-day" // a lieu l'autre jour du week-end
  | "unknown"; // hors festival, ou horaire illisible

export const EVENT_STATUS_LABELS: Record<Exclude<EventTimeStatus, "unknown" | "other-day">, string> = {
  upcoming: "Bientôt",
  ongoing: "En cours",
  past: "Terminé",
  tomorrow: "Demain",
};

/**
 * Extrait un créneau « HHhMM - HHhMM » en minutes depuis minuit.
 * Tolère « 14:00 - 14:30 », « 12h00 - 19h00 », « 14h-15h », « 12h00 - 19h00,
 * samedi et dimanche ». Renvoie null si rien d'exploitable.
 */
export function parseTimeRange(time: string): { startMinutes: number; endMinutes: number } | null {
  if (!time) return null;
  // Les jours éventuellement accolés à l'horaire ne nous intéressent pas ici.
  const head = time.split(",")[0];
  const matches = [...head.matchAll(/(\d{1,2})\s*[h:]\s*(\d{2})?/g)];
  if (matches.length === 0) return null;

  const toMinutes = (m: RegExpMatchArray) => Number(m[1]) * 60 + Number(m[2] || 0);
  const startMinutes = toMinutes(matches[0]);
  // Un horaire ponctuel (« 15h ») n'a pas de fin : on le traite comme instantané.
  const endMinutes = matches.length > 1 ? toMinutes(matches[1]) : startMinutes;
  if (startMinutes > 24 * 60 || endMinutes > 24 * 60 || endMinutes < startMinutes) return null;

  return { startMinutes, endMinutes };
}

/** Jour de festival en cours, ou null si l'on n'y est pas. */
export function currentFestivalDay(now: Date = new Date()): Day | null {
  const { samedi, dimanche } = getFestivalDates(now);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  if (today === samedi) return "samedi";
  if (today === dimanche) return "dimanche";
  return null;
}

/**
 * État d'un événement tel qu'il doit être présenté dans la section d'un jour.
 * `day` est la section affichée : un événement listé sous « dimanche » alors
 * qu'il n'a lieu que le samedi est signalé comme tel.
 */
export function eventStatus(event: Event, day: Day, now: Date = new Date()): EventTimeStatus {
  const today = currentFestivalDay(now);
  // Hors week-end de festival, le programme reste un catalogue.
  if (!today) return "unknown";

  if (!event.days?.includes(day)) return "other-day";
  // La section affichée n'est pas le jour courant : rien à qualifier, ce qui
  // s'y passe est à venir (demain) ou révolu (hier), pas « en cours ».
  if (day !== today) return "unknown";

  const range = parseTimeRange(event.time);
  if (!range) return "unknown";

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (minutesNow < range.startMinutes) return "upcoming";
  if (minutesNow <= range.endMinutes) return "ongoing";
  return "past";
}

/**
 * État d'un événement par rapport au jour courant, sans section de référence :
 * pour les écrans qui listent un lieu plutôt qu'une journée.
 */
export function eventStatusToday(event: Event, now: Date = new Date()): EventTimeStatus {
  const today = currentFestivalDay(now);
  if (!today) return "unknown";

  const status = eventStatus(event, today, now);
  // Hors section de jour, « Terminé » ferait croire que l'artiste est parti :
  // une exposition ouverte samedi et dimanche rouvre demain. On le dit.
  const tomorrow: Day | null = today === "samedi" ? "dimanche" : null;
  if (tomorrow && event.days?.includes(tomorrow) && (status === "past" || status === "other-day")) {
    return "tomorrow";
  }
  return status;
}

/** Les jours du week-end où l'artiste n'est pas présent, pour le dire clairement. */
export function absentDayLabel(event: Event): string | null {
  const samedi = event.days?.includes("samedi");
  const dimanche = event.days?.includes("dimanche");
  if (samedi && !dimanche) return "Samedi uniquement";
  if (dimanche && !samedi) return "Dimanche uniquement";
  return null;
}
