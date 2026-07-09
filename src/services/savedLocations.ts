import { Location } from "@/data/locations";
import { dataService } from "./dataService";
import { getSavedEvents } from "./savedEvents";
import { AchievementType, unlockAchievement } from "./achievements";

const STORAGE_KEY = 'savedLocations';

const readIds = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : [];
  } catch (error) {
    console.error('Erreur dans savedLocations.readIds:', error);
    return [];
  }
};

const writeIds = (ids: string[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('savedLocationsChanged'));
};

export const getSavedLocationIds = (): string[] => readIds();

export const getSavedLocations = (): Location[] =>
  readIds()
    .map(id => dataService.getLocationById(id))
    .filter((loc): loc is Location => Boolean(loc));

export const isLocationSaved = (locationId: string): boolean => readIds().includes(locationId);

export const saveLocation = (locationId: string): string[] => {
  const ids = readIds();
  if (!ids.includes(locationId)) {
    const updated = [...ids, locationId];
    writeIds(updated);

    // Réalisations partagées avec les événements sauvegardés (même compteur global)
    const total = getSavedEvents().length + updated.length;
    setTimeout(() => {
      if (total === 1) unlockAchievement(AchievementType.FIRST_EVENT_SAVED);
      if (total >= 5) unlockAchievement(AchievementType.MULTIPLE_EVENTS_SAVED);
    }, 500);

    return updated;
  }
  return ids;
};

export const removeSavedLocation = (locationId: string): string[] => {
  const updated = readIds().filter(id => id !== locationId);
  writeIds(updated);
  return updated;
};

// Remplacer la liste complète (sync serveur) — un seul dispatch, aucun effet de bord
export const replaceSavedLocations = (ids: string[]): void => {
  try {
    const clean = Array.from(new Set(ids.filter(id => typeof id === 'string' && id)));
    writeIds(clean);
  } catch (error) {
    console.error('Erreur dans replaceSavedLocations:', error);
  }
};

export const toggleSavedLocation = (locationId: string): string[] => {
  return isLocationSaved(locationId) ? removeSavedLocation(locationId) : saveLocation(locationId);
};
