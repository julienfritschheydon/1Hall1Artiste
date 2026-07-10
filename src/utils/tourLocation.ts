import { Location, locations } from "@/data/locations";
import { Tour } from "@/types/visitTypes";

// Une visite n'a pas de locationId — juste des coordonnées x/y sur la carte
// custom, choisies par le guide dans une liste (visit_locations, RTDB,
// gérée par l'admin) qui est un jeu de données SÉPARÉ de data/locations.ts
// (utilisé partout ailleurs sur la carte). Rien ne garantit que les deux
// jeux de coordonnées coïncident au pixel près pour le même bâtiment — donc
// on matche par proximité, pas par égalité stricte.
const MATCH_RADIUS_PX = 25;

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function findLocationForTour(tour: Pick<Tour, "startLocationX" | "startLocationY">): Location | undefined {
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

export function toursAtLocation(tours: Tour[], location: Pick<Location, "x" | "y">): Tour[] {
  return tours.filter((t) => distance(t.startLocationX, t.startLocationY, location.x, location.y) <= MATCH_RADIUS_PX);
}
