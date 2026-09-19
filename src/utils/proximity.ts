// Sélection des lieux « à proximité » de l'utilisateur, pour le panneau de la
// carte. Extrait de ProximityGuide.tsx pour être testable sans monter React ni
// simuler une géolocalisation.
import type { Location } from "@/data/locations";
import { getGpsCoordinateById, FEYDEAU_CENTER } from "@/data/gpsCoordinates";

/** Distance maximale, en mètres, pour qu'un lieu soit proposé dans le panneau. */
export const PROXIMITY_THRESHOLD = 50;

/**
 * En deçà, on considère que l'utilisateur est devant le bâtiment. La précision
 * GPS en ville dense tourne autour de 10-20 m : annoncer « vous y êtes » plus
 * tôt reviendrait à l'affirmer sur du bruit de mesure.
 */
export const AT_LOCATION_THRESHOLD = 20;

/** Nombre maximal de lieux affichés, même si davantage sont dans le rayon. */
export const MAX_NEARBY = 5;

export type LocationWithDistance = Location & {
  distance: number;
  direction: string;
};

/** Distance en mètres entre deux points GPS (formule de haversine). */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // rayon de la Terre, en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Direction cardinale, en français, du premier point vers le second. */
export function getDirection(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;

  let angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  if (angle >= 337.5 || angle < 22.5) return "nord";
  if (angle < 67.5) return "nord-est";
  if (angle < 112.5) return "est";
  if (angle < 157.5) return "sud-est";
  if (angle < 202.5) return "sud";
  if (angle < 247.5) return "sud-ouest";
  if (angle < 292.5) return "ouest";
  return "nord-ouest";
}

/**
 * Les lieux réellement à portée de marche immédiate, du plus proche au plus
 * loin, au maximum `MAX_NEARBY`.
 *
 * Le seuil ne servait auparavant qu'à colorer les lignes : la liste retenait
 * les 5 plus proches sans condition de distance. Le panneau annonçait donc
 * « 5 lieux à proximité » même quand le plus proche était à 800 m, et restait
 * affiché en permanence — y compris pour quelqu'un qui n'est pas sur l'île.
 */
export function computeNearbyLocations(
  userPosition: { latitude: number; longitude: number },
  locations: Location[],
  threshold: number = PROXIMITY_THRESHOLD
): LocationWithDistance[] {
  return locations
    .map((location) => {
      // Sans coordonnées propres, on retombe sur le centre de l'île : c'est une
      // approximation volontaire, jamais une exclusion silencieuse.
      const gpsCoord = getGpsCoordinateById(location.id);
      const locationLat = gpsCoord ? gpsCoord.latitude : FEYDEAU_CENTER.latitude;
      const locationLng = gpsCoord ? gpsCoord.longitude : FEYDEAU_CENTER.longitude;

      return {
        ...location,
        distance: calculateDistance(userPosition.latitude, userPosition.longitude, locationLat, locationLng),
        direction: getDirection(userPosition.latitude, userPosition.longitude, locationLat, locationLng),
      };
    })
    .filter((l) => l.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_NEARBY);
}
