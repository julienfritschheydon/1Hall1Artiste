import { Location } from "@/data/locations";
import { dataService } from "./dataService";

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
    return updated;
  }
  return ids;
};

export const removeSavedLocation = (locationId: string): string[] => {
  const updated = readIds().filter(id => id !== locationId);
  writeIds(updated);
  return updated;
};

export const toggleSavedLocation = (locationId: string): string[] => {
  return isLocationSaved(locationId) ? removeSavedLocation(locationId) : saveLocation(locationId);
};
