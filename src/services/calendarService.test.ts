import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addToCalendar, buildGoogleCalendarUrl } from "./calendarService";
import { getFestivalDates } from "@/utils/festival";
import type { Event } from "@/data/events";

// Les horaires du Google Sheet sont des heures françaises : l'export doit les
// convertir depuis Europe/Paris, quel que soit le fuseau de l'appareil.
const parisToUtcStamp = (isoDay: string, hhmm: string) => {
  const [year, month, day] = isoDay.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const offset = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map(({ type, value }) => [type, value])
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return (asUtc - instant) / 60000;
  };
  const instant = naive - offset(naive - offset(naive) * 60000) * 60000;
  return new Date(instant).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

const event = {
  id: "evt-1",
  title: "Concert de jazz",
  artistName: "Trio Feydeau",
  days: ["samedi"],
  time: "15h00 - 16h30",
} as unknown as Event;

const setUserAgent = (ua: string) => {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
};

const originalUserAgent = navigator.userAgent;

describe("calendarService", () => {
  afterEach(() => {
    setUserAgent(originalUserAgent);
    vi.restoreAllMocks();
  });

  describe("buildGoogleCalendarUrl", () => {
    // Les horaires viennent du Google Sheet : ils sont saisis librement.
    // « 14:00 - 18:00 » produisait une date invalide (split('h') ne renvoyait
    // qu'un élément, donc des minutes undefined) et toute l'opération levait
    // « RangeError: Invalid time value ».
    it.each([
      ["15h00 - 16h30", "15:00", "16:30"],
      ["14:00 - 18:00", "14:00", "18:00"],
      ["14h - 18h", "14:00", "18:00"],
      ["10h30-12h", "10:30", "12:00"],
      ["19h, samedi et dimanche", "19:00", "20:00"],
      ["14h", "14:00", "15:00"],
    ])("gère l'horaire %s", (time, expectedStart, expectedEnd) => {
      const url = buildGoogleCalendarUrl({ ...event, time } as Event);
      expect(url).not.toBeNull();
      const samedi = getFestivalDates().samedi;
      const [start, end] = (new URL(url as string).searchParams.get("dates") ?? "").split("/");
      const toUtc = (hhmm: string) => parisToUtcStamp(samedi, hhmm);
      expect(start).toBe(toUtc(expectedStart));
      expect(end).toBe(toUtc(expectedEnd));
    });

    it("place l'événement à l'heure française même si l'appareil est dans un autre fuseau", () => {
      // Le festival a lieu en septembre : Paris est à UTC+2 (CEST).
      const samedi = getFestivalDates().samedi;
      const url = new URL(buildGoogleCalendarUrl(event) as string);
      const [start] = (url.searchParams.get("dates") ?? "").split("/");
      expect(start).toBe(`${samedi.replace(/-/g, "")}T130000Z`);
    });

    it("renvoie null sur un horaire illisible plutôt que de lever une erreur", () => {
      expect(buildGoogleCalendarUrl({ ...event, time: "sur réservation" } as Event)).toBeNull();
      expect(buildGoogleCalendarUrl({ ...event, time: "" } as Event)).toBeNull();
    });

    it("pointe sur le week-end du festival avec les bonnes heures", () => {
      const url = new URL(buildGoogleCalendarUrl(event) as string);
      const samedi = getFestivalDates().samedi;
      const [start, end] = (url.searchParams.get("dates") ?? "").split("/");

      expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
      expect(url.searchParams.get("action")).toBe("TEMPLATE");
      expect(url.searchParams.get("text")).toBe("Concert de jazz");
      expect(url.searchParams.get("location")).toBe("Île Feydeau, Nantes");
      // Les dates sont en UTC, converties depuis l'heure française.
      expect(parisToUtcStamp(samedi, "15:00")).toBe(start);
      expect(parisToUtcStamp(samedi, "16:30")).toBe(end);
    });
  });

  describe("addToCalendar", () => {
    it("échoue proprement avec un message explicite si l'horaire est illisible", async () => {
      const result = await addToCalendar({ ...event, time: "sur réservation" } as Event);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("sur réservation");
    });
  });

  describe("addToCalendar sur Android", () => {
    beforeEach(() => {
      setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
    });

    it("ouvre Google Agenda via une ancre, pas via window.open (bloqué en PWA)", async () => {
      const open = vi.spyOn(window, "open");
      const share = vi.fn();
      Object.defineProperty(navigator, "share", { value: share, configurable: true });
      const clicked: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

      const result = await addToCalendar(event);

      expect(result.success).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(clicked).toHaveLength(1);
      expect(clicked[0].href).toBe(buildGoogleCalendarUrl(event) as string);
      expect(clicked[0].target).toBe("_blank");
      expect(share).not.toHaveBeenCalled();
    });

    it("retombe sur le partage de fichier .ics si le document est indisponible", async () => {
      vi.spyOn(document, "contains").mockReturnValue(false);
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { value: share, configurable: true });
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });

      const result = await addToCalendar(event);

      expect(result.success).toBe(true);
      expect(share).toHaveBeenCalledTimes(1);
      const files = share.mock.calls[0][0].files as File[];
      expect(files[0].name).toBe("Concert_de_jazz.ics");
    });
  });
});
