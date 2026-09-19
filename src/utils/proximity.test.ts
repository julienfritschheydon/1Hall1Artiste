// Sélection des lieux « à proximité » affichés sur la carte.
//
// Régression verrouillée ici : le seuil de 50 m ne servait qu'à colorer les
// lignes. La liste, elle, retenait les 5 lieux les plus proches sans aucune
// condition de distance — le panneau annonçait donc « 5 lieux à proximité » même
// quand le plus proche était à 800 m, et restait affiché en permanence, y
// compris pour quelqu'un qui n'est pas sur l'île.
import { describe, it, expect, vi } from "vitest";

// Deux lieux fictifs aux coordonnées maîtrisées, pour raisonner en mètres
// plutôt qu'en degrés. 0,0001° de latitude ≈ 11 m.
const BASE = { latitude: 47.2128, longitude: -1.5535 };

vi.mock("@/data/gpsCoordinates", () => ({
  FEYDEAU_CENTER: BASE,
  getGpsCoordinateById: (id: string) =>
    ({
      "tout-pres": { id: "tout-pres", latitude: BASE.latitude + 0.00005, longitude: BASE.longitude }, // ~6 m
      proche: { id: "proche", latitude: BASE.latitude + 0.0003, longitude: BASE.longitude }, // ~33 m
      "au-nord": { id: "au-nord", latitude: BASE.latitude + 0.0004, longitude: BASE.longitude }, // ~44 m
      loin: { id: "loin", latitude: BASE.latitude + 0.008, longitude: BASE.longitude }, // ~890 m
      "tres-loin": { id: "tres-loin", latitude: BASE.latitude + 0.05, longitude: BASE.longitude }, // ~5,5 km
    }[id]),
}));

const { computeNearbyLocations, calculateDistance, getDirection, PROXIMITY_THRESHOLD } = await import(
  "./proximity"
);

function loc(id: string) {
  return { id, name: id } as any;
}

describe("computeNearbyLocations", () => {
  it("ne retient que les lieux sous le seuil", () => {
    const result = computeNearbyLocations(BASE, [loc("proche"), loc("loin"), loc("tres-loin")]);

    expect(result.map((l) => l.id)).toEqual(["proche"]);
  });

  it("retourne une liste vide quand tout est loin — le panneau disparaît", () => {
    // C'est le cœur du bug : un utilisateur à l'autre bout de Nantes voyait
    // « 5 lieux à proximité ».
    const result = computeNearbyLocations(BASE, [loc("loin"), loc("tres-loin")]);

    expect(result).toEqual([]);
  });

  it("trie du plus proche au plus lointain", () => {
    const result = computeNearbyLocations(BASE, [loc("au-nord"), loc("tout-pres"), loc("proche")]);

    expect(result.map((l) => l.id)).toEqual(["tout-pres", "proche", "au-nord"]);
  });

  it("plafonne à 5 lieux même si davantage sont dans le rayon", () => {
    const many = Array.from({ length: 8 }, (_, i) => loc(`proche`));
    const result = computeNearbyLocations(BASE, many);

    expect(result).toHaveLength(5);
  });

  it("calcule une distance et une direction exploitables", () => {
    const [nearest] = computeNearbyLocations(BASE, [loc("proche")]);

    expect(nearest.distance).toBeGreaterThan(25);
    expect(nearest.distance).toBeLessThan(40);
    expect(nearest.direction).toBe("nord");
  });

  it("accepte un seuil explicite", () => {
    // À 1 km, le lieu « loin » (~890 m) rentre.
    const result = computeNearbyLocations(BASE, [loc("loin"), loc("tres-loin")], 1000);

    expect(result.map((l) => l.id)).toEqual(["loin"]);
  });

  it("garde un lieu sans coordonnées propres, rabattu sur le centre de l'île", () => {
    // Repli volontaire, jamais une exclusion silencieuse.
    const result = computeNearbyLocations(BASE, [loc("inconnu")]);

    expect(result.map((l) => l.id)).toEqual(["inconnu"]);
    expect(result[0].distance).toBeCloseTo(0, 5);
  });

  it("expose un seuil par défaut à l'échelle du quartier", () => {
    expect(PROXIMITY_THRESHOLD).toBe(50);
  });
});

describe("calculateDistance", () => {
  it("vaut zéro pour un point sur lui-même", () => {
    expect(calculateDistance(47.2128, -1.5535, 47.2128, -1.5535)).toBeCloseTo(0, 6);
  });

  it("mesure environ 111 km par degré de latitude", () => {
    const d = calculateDistance(47, -1.5535, 48, -1.5535);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("getDirection", () => {
  it("nomme les quatre points cardinaux", () => {
    expect(getDirection(47, -1.55, 48, -1.55)).toBe("nord");
    expect(getDirection(47, -1.55, 46, -1.55)).toBe("sud");
    expect(getDirection(47, -1.55, 47, -1.0)).toBe("est");
    expect(getDirection(47, -1.55, 47, -2.0)).toBe("ouest");
  });

  it("nomme les diagonales", () => {
    expect(getDirection(47, -1.55, 48, -0.55)).toBe("nord-est");
    expect(getDirection(47, -1.55, 46, -2.55)).toBe("sud-ouest");
  });
});
