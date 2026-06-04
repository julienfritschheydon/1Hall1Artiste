import { describe, it, expect } from "vitest";
import {
  isPositionWithinFeydeau,
  calculateDistanceToCenter,
  getDirectionToFeydeau,
  shouldShowLocationNotification,
  type GeoPosition,
} from "./locationUtils";
import { FEYDEAU_CENTER } from "@/data/gpsCoordinates";

const pos = (latitude: number, longitude: number): GeoPosition => ({
  latitude,
  longitude,
  accuracy: 5,
});

describe("calculateDistanceToCenter", () => {
  it("retourne ~0 au centre de l'Île", () => {
    expect(
      calculateDistanceToCenter(FEYDEAU_CENTER.latitude, FEYDEAU_CENTER.longitude)
    ).toBeLessThan(1);
  });

  it("retourne ~111 m pour 0.001° de latitude d'écart", () => {
    const d = calculateDistanceToCenter(
      FEYDEAU_CENTER.latitude + 0.001,
      FEYDEAU_CENTER.longitude
    );
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(130);
  });
});

describe("isPositionWithinFeydeau", () => {
  it("est vrai au centre de l'Île", () => {
    expect(
      isPositionWithinFeydeau(pos(FEYDEAU_CENTER.latitude, FEYDEAU_CENTER.longitude))
    ).toBe(true);
  });

  it("est faux pour une position très éloignée", () => {
    expect(isPositionWithinFeydeau(pos(48.85, 2.35))).toBe(false);
  });
});

describe("getDirectionToFeydeau", () => {
  it("retourne une direction cardinale valide", () => {
    const valid = [
      "nord",
      "nord-est",
      "est",
      "sud-est",
      "sud",
      "sud-ouest",
      "ouest",
      "nord-ouest",
    ];
    expect(valid).toContain(getDirectionToFeydeau(pos(47.0, -1.6)));
  });
});

describe("shouldShowLocationNotification", () => {
  it("n'affiche pas si l'utilisateur est dans l'Île", () => {
    expect(shouldShowLocationNotification(true, false, false, true)).toBe(false);
  });

  it("affiche si loin du centre, pas première position, pas récemment activé", () => {
    expect(shouldShowLocationNotification(false, false, false, true)).toBe(true);
  });
});
