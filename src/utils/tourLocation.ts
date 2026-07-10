import { Location, locations } from "@/data/locations";
import { Tour } from "@/types/visitTypes";

// Lien fiable : startLocationId référence directement l'id réel du bâtiment
// (data/locations.ts), renseigné depuis la création de la visite dans
// GuidePortal. Les tours créés avant l'ajout de ce champ n'ont que des
// coordonnées x/y et un nom — on retombe alors sur un matching approximatif
// (proximité + nom) en dernier recours.
const MATCH_RADIUS_PX = 25;

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

type TourLike = Pick<Tour, "startLocationX" | "startLocationY"> & {
  startLocationName?: string;
  startLocationId?: string;
};

export function findLocationForTour(tour: TourLike): Location | undefined {
  if (tour.startLocationId) {
    const byId = locations.find((l) => l.id === tour.startLocationId);
    if (byId) return byId;
  }

  const byName = tour.startLocationName
    ? locations.find((l) => namesMatch(l.name, tour.startLocationName))
    : undefined;
  if (byName) return byName;

  let closest: Location | undefined;
  let closestDist = Infinity;
  for (const l of locations) {
    const d = distance(l.x, l.y, tour.startLocationX, tour.startLocationY);
    if (d < closestDist) {
      closestDist = d;
      closest = l;
    }
  }
  return closestDist <= MATCH_RADIUS_PX ? closest : undefined;
}

export function toursAtLocation(tours: Tour[], location: Pick<Location, "id" | "x" | "y" | "name">): Tour[] {
  return tours.filter((t) => {
    // Un id présent est autoritaire : ne jamais retomber sur un matching
    // approximatif qui pourrait faire apparaître la visite ailleurs.
    if (t.startLocationId) return t.startLocationId === location.id;
    return (
      namesMatch(location.name, t.startLocationName) ||
      distance(t.startLocationX, t.startLocationY, location.x, location.y) <= MATCH_RADIUS_PX
    );
  });
}
