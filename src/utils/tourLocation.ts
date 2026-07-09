import { Location, locations } from "@/data/locations";
import { Tour } from "@/types/visitTypes";

// Une visite n'a pas de locationId — juste des coordonnées x/y sur la carte
// custom (choisies par le guide parmi les points prédéfinis). On retrouve le
// bâtiment correspondant par coïncidence exacte de coordonnées.
export function findLocationForTour(tour: Pick<Tour, "startLocationX" | "startLocationY">): Location | undefined {
  return locations.find((l) => l.x === tour.startLocationX && l.y === tour.startLocationY);
}

export function toursAtLocation(tours: Tour[], location: Pick<Location, "x" | "y">): Tour[] {
  return tours.filter((t) => t.startLocationX === location.x && t.startLocationY === location.y);
}
