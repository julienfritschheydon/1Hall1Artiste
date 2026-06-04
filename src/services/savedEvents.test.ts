import { describe, it, expect, vi } from "vitest";

// Les données statiques `events` sont vides (chargées dynamiquement depuis l'API).
// On mocke le module pour fournir un événement de référence à la logique de favoris.
const { sampleEvent } = vi.hoisted(() => ({
  sampleEvent: {
    id: "event-test-1",
    title: "Concert test",
    artistId: "artiste-test",
    artistName: "Artiste Test",
    type: "concert",
    time: "14:00 - 14:30",
    days: ["samedi"],
    locationId: "lieu-test",
    locationName: "Lieu Test",
  } as any,
}));

vi.mock("@/data/events", () => ({
  events: [sampleEvent],
}));

// Éviter les effets de bord des achievements (timers, localStorage).
vi.mock("./achievements", () => ({
  unlockAchievement: vi.fn(),
  AchievementType: { FIRST_EVENT_SAVED: "first", MULTIPLE_EVENTS_SAVED: "multi" },
}));

import { getSavedEvents, saveEvent, removeSavedEvent } from "./savedEvents";

describe("savedEvents", () => {
  it("retourne un tableau vide si localStorage est vide", () => {
    expect(getSavedEvents()).toEqual([]);
  });

  it("retourne un tableau vide si la valeur stockée est corrompue", () => {
    localStorage.setItem("savedEvents", "{pas du json");
    expect(getSavedEvents()).toEqual([]);
  });

  it("retourne un tableau vide si la valeur stockée n'est pas un tableau", () => {
    localStorage.setItem("savedEvents", JSON.stringify({ foo: "bar" }));
    expect(getSavedEvents()).toEqual([]);
  });

  it("sauvegarde un événement existant", () => {
    const result = saveEvent(sampleEvent);
    expect(result.some((e) => e.id === sampleEvent.id)).toBe(true);
  });

  it("ne crée pas de doublon", () => {
    saveEvent(sampleEvent);
    saveEvent(sampleEvent);
    const ids = JSON.parse(localStorage.getItem("savedEvents") || "[]");
    expect(ids.filter((id: string) => id === sampleEvent.id)).toHaveLength(1);
  });

  it("ignore un id inexistant lors de la lecture", () => {
    localStorage.setItem("savedEvents", JSON.stringify(["id-qui-nexiste-pas"]));
    expect(getSavedEvents()).toEqual([]);
  });

  it("supprime un événement sauvegardé", () => {
    saveEvent(sampleEvent);
    const result = removeSavedEvent(sampleEvent.id);
    expect(result.some((e) => e.id === sampleEvent.id)).toBe(false);
  });
});
