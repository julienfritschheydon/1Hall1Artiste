import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_HIDDEN_EVENT_IDS,
  HIDDEN_EVENTS_STORAGE_KEY,
  clearHiddenEvents,
  filterHiddenEvents,
  getHiddenEventIds,
  hideEvent,
  isEventHidden,
  unhideEvent,
} from "@/config/hiddenEvents";

describe("hiddenEvents", () => {
  beforeEach(() => {
    localStorage.removeItem(HIDDEN_EVENTS_STORAGE_KEY);
  });

  it("masque par défaut les désistements versionnés", () => {
    for (const id of DEFAULT_HIDDEN_EVENT_IDS) {
      expect(isEventHidden(id)).toBe(true);
    }
    expect(isEventHidden("expo-daphne-poblete")).toBe(false);
  });

  it("retire les événements masqués d'une liste", () => {
    const events = [
      { id: "expo-pauline-burnol" },
      { id: "expo-yeline-jung" },
      { id: "expo-christian-evain" },
    ];
    expect(filterHiddenEvents(events)).toEqual([{ id: "expo-christian-evain" }]);
  });

  it("persiste une suppression faite depuis l'admin", () => {
    hideEvent("concert-x-samedi");
    expect(getHiddenEventIds().has("concert-x-samedi")).toBe(true);
    expect(JSON.parse(localStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      "concert-x-samedi",
    ]);

    // Idempotent : pas de doublon.
    hideEvent("concert-x-samedi");
    expect(JSON.parse(localStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY) ?? "[]")).toEqual([
      "concert-x-samedi",
    ]);
  });

  it("permet d'annuler une suppression locale", () => {
    hideEvent("concert-x-samedi");
    unhideEvent("concert-x-samedi");
    expect(isEventHidden("concert-x-samedi")).toBe(false);
  });

  it("clearHiddenEvents ne touche pas à la liste versionnée", () => {
    hideEvent("concert-x-samedi");
    clearHiddenEvents();
    expect(isEventHidden("concert-x-samedi")).toBe(false);
    expect(isEventHidden(DEFAULT_HIDDEN_EVENT_IDS[0])).toBe(true);
  });
});
