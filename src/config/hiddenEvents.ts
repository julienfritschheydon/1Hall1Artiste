// Événements retirés de la programmation.
//
// La source de vérité du programme reste les Google Sheets (via /api/program).
// Quand un artiste se désiste après coup, on ne peut pas toujours éditer le Sheet
// dans la foulée : on masque donc l'événement côté app.
//
// Deux niveaux :
//  - DEFAULT_HIDDEN_EVENT_IDS : liste versionnée, appliquée à tous les visiteurs
//    dès le déploiement ;
//  - localStorage ("hiddenEventIds") : suppressions faites depuis l'admin, locales
//    au navigateur, qui survivent aux refresh du programme distant.

import { createLogger } from "@/utils/logger";

const logger = createLogger("HiddenEvents");

export const HIDDEN_EVENTS_STORAGE_KEY = "hiddenEventIds";

// Désistements 2026 : retirés de la programmation à la demande des organisateurs.
export const DEFAULT_HIDDEN_EVENT_IDS: string[] = [
  "expo-pauline-burnol",
  "expo-yeline-jung",
];

function readStoredIds(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch (e) {
    logger.warn("Lecture des événements masqués impossible", e);
    return [];
  }
}

function writeStoredIds(ids: string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(HIDDEN_EVENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    logger.warn("Écriture des événements masqués impossible", e);
  }
}

export function getHiddenEventIds(): Set<string> {
  return new Set([...DEFAULT_HIDDEN_EVENT_IDS, ...readStoredIds()]);
}

export function isEventHidden(eventId: string): boolean {
  return getHiddenEventIds().has(eventId);
}

export function hideEvent(eventId: string): void {
  const stored = readStoredIds();
  if (!stored.includes(eventId)) {
    writeStoredIds([...stored, eventId]);
  }
}

export function unhideEvent(eventId: string): void {
  writeStoredIds(readStoredIds().filter((id) => id !== eventId));
}

// Réinitialise uniquement les suppressions locales (l'admin peut ainsi revenir
// au programme du Sheet sans vider tout le localStorage).
export function clearHiddenEvents(): void {
  writeStoredIds([]);
}

export function filterHiddenEvents<T extends { id: string }>(events: T[]): T[] {
  const hidden = getHiddenEventIds();
  if (hidden.size === 0) return events;
  return events.filter((event) => !hidden.has(event.id));
}
