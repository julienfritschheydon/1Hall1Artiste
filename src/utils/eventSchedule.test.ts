import { describe, it, expect } from "vitest";
import { Event } from "@/data/events";
import { getFestivalDates } from "@/utils/festival";
import {
  parseTimeRange,
  currentFestivalDay,
  eventStatus,
  absentDayLabel,
  eventStatusToday,
} from "@/utils/eventSchedule";

function evt(partial: Partial<Event>): Event {
  return {
    id: "e",
    artistId: "a",
    title: "Événement",
    time: "14:00 - 14:30",
    days: ["samedi", "dimanche"],
    locationId: "l",
    locationName: "Lieu",
    artistName: "Artiste",
    type: "concert",
    ...partial,
  } as Event;
}

// Le festival est calculé pour l'année courante : on part de ses vraies dates
// pour que ces tests ne dépendent pas du jour où la suite tourne.
const { samedi, dimanche } = getFestivalDates();
const saturdayAt = (h: number, m = 0) => new Date(`${samedi}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
const sundayAt = (h: number) => new Date(`${dimanche}T${String(h).padStart(2, "0")}:00:00`);

describe("parseTimeRange", () => {
  it("lit les formats du Sheet", () => {
    expect(parseTimeRange("14:00 - 14:30")).toEqual({ startMinutes: 840, endMinutes: 870 });
    expect(parseTimeRange("12h00 - 19h00")).toEqual({ startMinutes: 720, endMinutes: 1140 });
    expect(parseTimeRange("12h00 - 19h00, samedi et dimanche")).toEqual({
      startMinutes: 720,
      endMinutes: 1140,
    });
  });

  it("accepte un horaire ponctuel", () => {
    expect(parseTimeRange("15h")).toEqual({ startMinutes: 900, endMinutes: 900 });
  });

  it("renvoie null sur ce qu'il ne comprend pas, plutôt que de deviner", () => {
    expect(parseTimeRange("")).toBeNull();
    expect(parseTimeRange("en continu")).toBeNull();
    expect(parseTimeRange("19h00 - 12h00")).toBeNull(); // fin avant début
  });
});

describe("currentFestivalDay", () => {
  it("reconnaît les deux jours du festival", () => {
    expect(currentFestivalDay(saturdayAt(15))).toBe("samedi");
    expect(currentFestivalDay(sundayAt(15))).toBe("dimanche");
  });

  it("renvoie null hors du week-end", () => {
    // Un mois avant le festival, quelle que soit l'année courante.
    const enJuin = new Date(saturdayAt(15));
    enJuin.setMonth(enJuin.getMonth() - 3);
    expect(currentFestivalDay(enJuin)).toBeNull();
  });
});

describe("eventStatus", () => {
  const concert = evt({ time: "14:00 - 14:30" });

  it("qualifie un concert du jour selon l'heure", () => {
    expect(eventStatus(concert, "samedi", saturdayAt(11))).toBe("upcoming");
    expect(eventStatus(concert, "samedi", saturdayAt(14, 10))).toBe("ongoing");
    expect(eventStatus(concert, "samedi", saturdayAt(16))).toBe("past");
  });

  it("signale un artiste absent le jour consulté", () => {
    const samediSeulement = evt({ days: ["samedi"] });
    expect(eventStatus(samediSeulement, "dimanche", sundayAt(15))).toBe("other-day");
  });

  it("ne qualifie rien pour une section qui n'est pas le jour courant", () => {
    expect(eventStatus(concert, "dimanche", saturdayAt(15))).toBe("unknown");
  });

  it("ne qualifie rien hors du week-end de festival", () => {
    const enJuin = new Date(saturdayAt(15));
    enJuin.setMonth(enJuin.getMonth() - 3);
    expect(eventStatus(concert, "samedi", enJuin)).toBe("unknown");
  });

  it("ne qualifie rien si l'horaire est illisible", () => {
    expect(eventStatus(evt({ time: "en continu" }), "samedi", saturdayAt(15))).toBe("unknown");
  });

  it("gère une exposition ouverte en journée", () => {
    const expo = evt({ type: "exposition", time: "12h00 - 19h00, samedi et dimanche" });
    expect(eventStatus(expo, "samedi", saturdayAt(15))).toBe("ongoing");
    expect(eventStatus(expo, "samedi", saturdayAt(19, 30))).toBe("past");
    expect(eventStatus(expo, "samedi", saturdayAt(10))).toBe("upcoming");
  });
});

describe("eventStatusToday", () => {
  const expo = evt({ type: "exposition", time: "12h00 - 19h00, samedi et dimanche" });

  it("annonce « Demain » plutôt que « Terminé » quand l'expo rouvre dimanche", () => {
    expect(eventStatusToday(expo, saturdayAt(21, 26))).toBe("tomorrow");
  });

  it("annonce « Demain » pour un artiste présent seulement dimanche", () => {
    expect(eventStatusToday(evt({ days: ["dimanche"] }), saturdayAt(15))).toBe("tomorrow");
  });

  it("garde « Terminé » quand l'événement ne revient pas", () => {
    expect(eventStatusToday(evt({ days: ["samedi"] }), saturdayAt(16))).toBe("past");
    expect(eventStatusToday(expo, sundayAt(20))).toBe("past");
  });

  it("n'écrase pas un créneau en cours", () => {
    expect(eventStatusToday(expo, saturdayAt(15))).toBe("ongoing");
  });
});

describe("absentDayLabel", () => {
  it("nomme le jour de présence quand il est unique", () => {
    expect(absentDayLabel(evt({ days: ["samedi"] }))).toBe("Samedi uniquement");
    expect(absentDayLabel(evt({ days: ["dimanche"] }))).toBe("Dimanche uniquement");
    expect(absentDayLabel(evt({ days: ["samedi", "dimanche"] }))).toBeNull();
  });
});
