import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./dataService", () => ({
  dataService: {
    getLocationById: vi.fn((id: string) =>
      id === "lieu-test" ? { id: "lieu-test", name: "Lieu Test" } : undefined
    ),
  },
}));

import {
  getSavedLocationIds,
  getSavedLocations,
  saveLocation,
  removeSavedLocation,
  toggleSavedLocation,
  replaceSavedLocations,
  isLocationSaved,
} from "./savedLocations";

describe("savedLocations", () => {
  let dispatched: number;
  const handler = () => dispatched++;

  beforeEach(() => {
    dispatched = 0;
    window.addEventListener("savedLocationsChanged", handler);
  });

  afterEach(() => {
    window.removeEventListener("savedLocationsChanged", handler);
  });

  it("retourne un tableau vide si localStorage est vide", () => {
    expect(getSavedLocationIds()).toEqual([]);
  });

  it("retourne un tableau vide si la valeur stockée est corrompue", () => {
    localStorage.setItem("savedLocations", "{pas du json");
    expect(getSavedLocationIds()).toEqual([]);
  });

  it("sauvegarde un lieu et dispatch l'événement", () => {
    saveLocation("lieu-test");
    expect(isLocationSaved("lieu-test")).toBe(true);
    expect(dispatched).toBe(1);
  });

  it("ne crée pas de doublon", () => {
    saveLocation("lieu-test");
    saveLocation("lieu-test");
    expect(getSavedLocationIds()).toEqual(["lieu-test"]);
  });

  it("supprime un lieu", () => {
    saveLocation("lieu-test");
    removeSavedLocation("lieu-test");
    expect(isLocationSaved("lieu-test")).toBe(false);
  });

  it("toggle ajoute puis retire", () => {
    toggleSavedLocation("lieu-test");
    expect(isLocationSaved("lieu-test")).toBe(true);
    toggleSavedLocation("lieu-test");
    expect(isLocationSaved("lieu-test")).toBe(false);
  });

  it("résout les objets Location et ignore les ids inconnus", () => {
    replaceSavedLocations(["lieu-test", "id-inconnu"]);
    const locations = getSavedLocations();
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe("Lieu Test");
  });

  it("replaceSavedLocations écrit, déduplique et dispatch une seule fois", () => {
    replaceSavedLocations(["a", "b", "a"]);
    expect(getSavedLocationIds()).toEqual(["a", "b"]);
    expect(dispatched).toBe(1);
  });
});
