import { describe, it, expect } from "vitest";
import { toggleDay, dayLabel, typeLabel, daySections, ALL_DAYS, ALL_TYPES } from "./programFilters";

describe("toggleDay", () => {
  it("décoche un jour quand l'autre reste coché", () => {
    expect(toggleDay(ALL_DAYS, "samedi")).toEqual(["dimanche"]);
    expect(toggleDay(ALL_DAYS, "dimanche")).toEqual(["samedi"]);
  });

  it("refuse de décocher le dernier jour", () => {
    expect(toggleDay(["samedi"], "samedi")).toEqual(["samedi"]);
    expect(toggleDay(["dimanche"], "dimanche")).toEqual(["dimanche"]);
  });

  it("recoche un jour en gardant l'ordre samedi → dimanche", () => {
    expect(toggleDay(["dimanche"], "samedi")).toEqual(["samedi", "dimanche"]);
    expect(toggleDay(["samedi"], "dimanche")).toEqual(["samedi", "dimanche"]);
  });
});

describe("dayLabel", () => {
  it("nomme le jour seul ou « Les deux jours »", () => {
    expect(dayLabel(ALL_DAYS)).toBe("Les deux jours");
    expect(dayLabel(["samedi"])).toBe("Samedi");
    expect(dayLabel(["dimanche"])).toBe("Dimanche");
  });
});

describe("typeLabel", () => {
  it("affiche la catégorie choisie ou « Tous les types »", () => {
    expect(typeLabel(ALL_TYPES)).toBe("Tous les types");
    expect(typeLabel("")).toBe("Tous les types");
    expect(typeLabel("Concert")).toBe("Concert");
  });
});

describe("daySections", () => {
  it("met un en-tête par jour seulement quand les deux sont affichés", () => {
    expect(daySections(ALL_DAYS)).toEqual([
      { day: "samedi", title: "Samedi" },
      { day: "dimanche", title: "Dimanche" },
    ]);
    expect(daySections(["dimanche"])).toEqual([{ day: "dimanche", title: null }]);
  });

  it("garde l'ordre du week-end quelle que soit la sélection", () => {
    expect(daySections(["dimanche", "samedi"]).map((s) => s.day)).toEqual(["samedi", "dimanche"]);
  });
});
