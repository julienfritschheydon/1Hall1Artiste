import { describe, it, expect } from "vitest";
import { groupEventsByDay, timeWithoutDays } from "@/utils/groupEventsByDay";
import { Event } from "@/data/events";

function evt(partial: Partial<Event> & { id: string }): Event {
  return {
    artistId: "a",
    title: partial.id,
    time: "14:00 - 14:30",
    days: ["samedi"],
    locationId: "quai-turenne-9",
    locationName: "09 quai Turenne",
    artistName: "Artiste",
    type: "concert",
    ...partial,
  } as Event;
}

describe("groupEventsByDay", () => {
  it("sépare les deux occurrences d'un même concert par jour", () => {
    const groups = groupEventsByDay([
      evt({ id: "concert-omega-dimanche", title: "Semaphore Omega", days: ["dimanche"] }),
      evt({ id: "concert-omega-samedi", title: "Semaphore Omega", days: ["samedi"] }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Samedi", "Dimanche"]);
    expect(groups[0].events.map((e) => e.id)).toEqual(["concert-omega-samedi"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["concert-omega-dimanche"]);
  });

  it("regroupe sous « Samedi et dimanche » ce qui est présent les deux jours", () => {
    const groups = groupEventsByDay([
      evt({
        id: "expo-deux-jours",
        type: "exposition",
        days: ["samedi", "dimanche"],
        time: "12h00 - 19h00, samedi et dimanche",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Samedi et dimanche");
  });

  it("ordonne les sections : les deux jours, puis samedi, puis dimanche", () => {
    const groups = groupEventsByDay([
      evt({ id: "d", days: ["dimanche"] }),
      evt({ id: "s", days: ["samedi"] }),
      evt({ id: "sd", days: ["samedi", "dimanche"] }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Samedi et dimanche", "Samedi", "Dimanche"]);
  });

  it("trie les événements d'une section par horaire", () => {
    const groups = groupEventsByDay([
      evt({ id: "tard", time: "17:00 - 17:30" }),
      evt({ id: "tot", time: "14:00 - 14:30" }),
      evt({ id: "milieu", time: "15:30 - 16:00" }),
    ]);

    expect(groups[0].events.map((e) => e.id)).toEqual(["tot", "milieu", "tard"]);
  });

  it("retombe sur samedi si les jours sont absents plutôt que de masquer l'événement", () => {
    const groups = groupEventsByDay([evt({ id: "sans-jour", days: [] })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Samedi");
    expect(groups[0].events.map((e) => e.id)).toEqual(["sans-jour"]);
  });
});

describe("timeWithoutDays", () => {
  it("retire le rappel des jours déjà porté par l'en-tête de section", () => {
    expect(timeWithoutDays("12h00 - 19h00, samedi et dimanche")).toBe("12h00 - 19h00");
    expect(timeWithoutDays("12h00 - 19h00, samedi")).toBe("12h00 - 19h00");
  });

  it("laisse un horaire de concert intact", () => {
    expect(timeWithoutDays("14:00 - 14:30")).toBe("14:00 - 14:30");
    expect(timeWithoutDays("")).toBe("");
  });
});
