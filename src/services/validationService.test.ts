import { describe, it, expect } from "vitest";
import { validateEvent, validateLocation, formatValidationErrors } from "./validationService";
import type { Event } from "@/data/events";
import type { Location } from "@/data/locations";

const validEvent = {
  id: "mon-event-1",
  title: "Concert test",
  artistName: "Artiste Test",
  type: "concert",
  artistBio: "Une bio.",
  time: "14:00 - 14:30",
  days: ["samedi"],
  locationName: "Quai Turenne",
} as unknown as Event;

describe("validateEvent", () => {
  it("accepte un événement valide", () => {
    const res = validateEvent(validEvent);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("rejette un id avec caractères interdits", () => {
    const res = validateEvent({ ...validEvent, id: "Mon Event!" } as Event);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.field === "id")).toBe(true);
  });

  it("rejette les champs requis manquants", () => {
    const res = validateEvent({ ...validEvent, title: "", artistName: "  " } as Event);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.field === "title")).toBe(true);
    expect(res.errors.some((e) => e.field === "artistName")).toBe(true);
  });

  it("rejette un type non autorisé", () => {
    const res = validateEvent({ ...validEvent, type: "atelier" as never } as Event);
    expect(res.errors.some((e) => e.field === "type")).toBe(true);
  });

  it("rejette un jour invalide", () => {
    const res = validateEvent({ ...validEvent, days: ["lundi"] as never } as Event);
    expect(res.errors.some((e) => e.field === "days")).toBe(true);
  });
});

describe("validateLocation", () => {
  const validLocation = {
    id: "quai-turenne-8",
    name: "Quai Turenne 8",
    description: "Un lieu.",
    x: 100,
    y: 200,
  } as unknown as Location;

  it("accepte un lieu valide", () => {
    expect(validateLocation(validLocation).isValid).toBe(true);
  });

  it("rejette des coordonnées non numériques", () => {
    const res = validateLocation({ ...validLocation, x: "abc" as never } as Location);
    expect(res.errors.some((e) => e.field === "x")).toBe(true);
  });
});

describe("formatValidationErrors", () => {
  it("formate les erreurs en une chaîne lisible", () => {
    const out = formatValidationErrors([
      { field: "id", message: "obligatoire" },
      { field: "title", message: "obligatoire" },
    ]);
    expect(out).toContain("id: obligatoire");
    expect(out.split("\n")).toHaveLength(2);
  });
});
