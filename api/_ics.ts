// Génération fichier .ics + lien "Ajouter à Google Calendar" pour une visite guidée.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Format UTC requis par le standard iCalendar (YYYYMMDDTHHMMSSZ)
function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escIcs(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export interface TourCalendarInfo {
  uid: string;
  title: string;
  description?: string;
  location: string;
  startIso: string; // ISO datetime
  durationMinutes: number;
}

export function buildIcs(info: TourCalendarInfo): string {
  const start = new Date(info.startIso);
  const end = new Date(start.getTime() + info.durationMinutes * 60000);
  const now = toIcsUtc(new Date().toISOString());

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collectif Île Feydeau//Visites guidées//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escIcs(info.uid)}@1hall1artiste.fr`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsUtc(start.toISOString())}`,
    `DTEND:${toIcsUtc(end.toISOString())}`,
    `SUMMARY:${escIcs(info.title)}`,
    info.description ? `DESCRIPTION:${escIcs(info.description)}` : "",
    `LOCATION:${escIcs(info.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function googleCalendarUrl(info: TourCalendarInfo): string {
  const start = new Date(info.startIso);
  const end = new Date(start.getTime() + info.durationMinutes * 60000);
  const dates = `${toIcsUtc(start.toISOString())}/${toIcsUtc(end.toISOString())}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: info.title,
    dates,
    details: info.description || "",
    location: info.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
