import { describe, it, expect } from "vitest";
import { Tour } from "@/types/visitTypes";
import {
  tourStatus,
  isTourOpenForRegistration,
  groupToursByStatus,
} from "@/utils/tourStatus";

function tour(id: string, date: string, durationMinutes = 90): Tour {
  return {
    id,
    guideId: "g",
    title: id,
    date,
    durationMinutes,
    startLocationX: 0,
    startLocationY: 0,
    capacity: 15,
    labels: [],
    status: "upcoming",
    createdAt: "",
    updatedAt: "",
  };
}

const NOW = new Date("2026-09-19T17:18:00Z").getTime();

describe("tourStatus", () => {
  it("distingue à venir, en cours et terminée", () => {
    expect(tourStatus(tour("t", "2026-09-19T18:00:00Z"), NOW)).toBe("upcoming");
    // Départ à 17h00, 90 min : à 17h18 la visite se déroule.
    expect(tourStatus(tour("t", "2026-09-19T17:00:00Z"), NOW)).toBe("ongoing");
    expect(tourStatus(tour("t", "2026-09-19T14:00:00Z"), NOW)).toBe("completed");
  });

  it("reste « en cours » jusqu'à la dernière minute", () => {
    expect(tourStatus(tour("t", "2026-09-19T15:48:00Z"), NOW)).toBe("ongoing");
    expect(tourStatus(tour("t", "2026-09-19T15:47:00Z"), NOW)).toBe("completed");
  });

  it("ferme l'inscription dès le départ, comme le serveur", () => {
    expect(isTourOpenForRegistration(tour("t", "2026-09-19T18:00:00Z"), NOW)).toBe(true);
    expect(isTourOpenForRegistration(tour("t", "2026-09-19T17:00:00Z"), NOW)).toBe(false);
    expect(isTourOpenForRegistration(tour("t", "2026-09-19T14:00:00Z"), NOW)).toBe(false);
  });
});

describe("groupToursByStatus", () => {
  it("ordonne les sections : en cours, à venir, passées", () => {
    const sections = groupToursByStatus(
      [
        tour("passee", "2026-09-19T14:00:00Z"),
        tour("a-venir", "2026-09-20T14:00:00Z"),
        tour("en-cours", "2026-09-19T17:00:00Z"),
      ],
      NOW
    );

    expect(sections.map((s) => s.title)).toEqual(["En cours", "À venir", "Passées"]);
    expect(sections.map((s) => s.tours.map((t) => t.id))).toEqual([
      ["en-cours"],
      ["a-venir"],
      ["passee"],
    ]);
  });

  it("omet les sections vides", () => {
    const sections = groupToursByStatus([tour("a-venir", "2026-09-20T14:00:00Z")], NOW);
    expect(sections.map((s) => s.title)).toEqual(["À venir"]);
  });

  it("trie les passées de la plus récente à la plus ancienne", () => {
    const sections = groupToursByStatus(
      [tour("matin", "2026-09-19T10:00:00Z"), tour("apres-midi", "2026-09-19T14:00:00Z")],
      NOW
    );

    expect(sections[0].tours.map((t) => t.id)).toEqual(["apres-midi", "matin"]);
  });

  it("trie les visites à venir chronologiquement", () => {
    const sections = groupToursByStatus(
      [tour("dimanche", "2026-09-20T14:00:00Z"), tour("ce-soir", "2026-09-19T18:00:00Z")],
      NOW
    );

    expect(sections[0].tours.map((t) => t.id)).toEqual(["ce-soir", "dimanche"]);
  });
});
