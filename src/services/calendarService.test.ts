import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addToCalendar, buildGoogleCalendarUrl } from "./calendarService";
import { getFestivalDates } from "@/utils/festival";
import type { Event } from "@/data/events";

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
    it("pointe sur le week-end du festival avec les bonnes heures", () => {
      const url = new URL(buildGoogleCalendarUrl(event));
      const samedi = getFestivalDates().samedi;
      const [start, end] = (url.searchParams.get("dates") ?? "").split("/");

      expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
      expect(url.searchParams.get("action")).toBe("TEMPLATE");
      expect(url.searchParams.get("text")).toBe("Concert de jazz");
      expect(url.searchParams.get("location")).toBe("Île Feydeau, Nantes");
      // Les dates sont en UTC ; on vérifie qu'elles encadrent bien le samedi du festival.
      expect(new Date(`${samedi}T15:00:00`).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z").toBe(start);
      expect(new Date(`${samedi}T16:30:00`).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z").toBe(end);
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
      expect(clicked[0].href).toBe(buildGoogleCalendarUrl(event));
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
