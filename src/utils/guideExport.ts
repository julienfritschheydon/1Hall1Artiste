// Génération des sorties papier / tableur du portail guide : feuilles d'appel
// imprimables et export CSV des inscrits.
//
// Ces fonctions vivaient dans GuidePortal.tsx et ne traitaient qu'une visite.
// Elles sont ici pour être réutilisées par la modale « Appels du jour » du
// dashboard, qui en imprime plusieurs d'un coup.
//
// Contrat de compatibilité : avec une seule feuille, sans `placesLeft` ni
// `waitlistWithOffer` et sans titre de document explicite, la sortie est
// IDENTIQUE à celle de l'ancien `printAttendance` — les boutons du détail
// visite ne doivent rien voir changer. Idem pour le CSV. Des tests de
// caractérisation verrouillent ces deux sorties.
import { Tour, placesOf } from "../types/visitTypes";
import { escapeCsvCell } from "./csv";

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );
}

export function formatCompanions(r: any): string {
  if (Array.isArray(r.companions) && r.companions.length > 0) {
    return r.companions.map((c: any) => `${c.firstName} ${c.lastName || ""}`.trim()).join(", ");
  }
  if (r.companionFirstName) return `${r.companionFirstName} ${r.companionLastName || ""}`.trim();
  return "-";
}

// "-" est le rendu écran d'une absence d'accompagnant ; sur papier et dans le
// CSV on préfère une cellule vide.
function companionsCell(r: any): string {
  const v = formatCompanions(r);
  return v === "-" ? "" : v;
}

export interface WaitlistOfferEntry {
  firstName: string;
  lastName: string;
  places?: number;
}

export interface AttendanceSheet {
  tour: Tour;
  registrations: any[];
  /** Affiché sous l'en-tête quand fourni — utile sur place pour les visiteurs spontanés. */
  placesLeft?: number;
  /** File d'attente dont l'offre est en cours : ces personnes peuvent se présenter. */
  waitlistWithOffer?: WaitlistOfferEntry[];
}

const CELL = 'style="border:1px solid #999;padding:6px"';

function sheetBody(sheet: AttendanceSheet): string {
  const { tour, registrations, placesLeft, waitlistWithOffer } = sheet;
  const dateStr = new Date(tour.date).toLocaleString("fr-FR");
  const totalPeople = registrations.reduce((s: number, r: any) => s + placesOf(r), 0);
  const rows = registrations
    .map(
      (r) => `<tr>
        <td style="border:1px solid #999;padding:6px;width:40px;text-align:center">☐</td>
        <td ${CELL}>${escapeHtml(r.lastName)}</td>
        <td ${CELL}>${escapeHtml(r.firstName)}</td>
        <td ${CELL}>${escapeHtml(companionsCell(r))}</td>
      </tr>`
    )
    .join("");

  const placesLine =
    placesLeft === undefined
      ? ""
      : `\n    <p style="color:#555">Places libres : ${placesLeft}/${tour.capacity}</p>`;

  const waitlistBlock =
    !waitlistWithOffer || waitlistWithOffer.length === 0
      ? ""
      : `\n    <h2 style="font-size:15px;margin-top:18px;color:#666">En attente (offre envoyée)</h2>
    <p style="color:#777;font-size:12px">Ces personnes ont reçu une proposition de place et peuvent se présenter.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;color:#666">
      <thead><tr>
        <th ${CELL}>Présent</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Nom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Prénom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Places</th>
      </tr></thead>
      <tbody>${waitlistWithOffer
        .map(
          (w) => `<tr>
        <td style="border:1px solid #999;padding:6px;width:40px;text-align:center">☐</td>
        <td ${CELL}>${escapeHtml(w.lastName)}</td>
        <td ${CELL}>${escapeHtml(w.firstName)}</td>
        <td ${CELL}>${w.places ?? 1}</td>
      </tr>`
        )
        .join("")}</tbody>
    </table>`;

  return `
    <h1 style="font-size:18px">Feuille d'appel — ${escapeHtml(tour.title)}</h1>
    <p style="color:#555">${dateStr} • ${totalPeople} personne(s) attendue(s)${
      tour.guides && tour.guides.length > 0 ? ` • Animé par ${escapeHtml(tour.guides.join(", "))}` : ""
    }</p>${placesLine}
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr>
        <th ${CELL}>Présent</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Nom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Prénom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Accompagnant</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>${waitlistBlock}`;
}

/**
 * Document imprimable contenant une feuille d'appel par visite, séparées par un
 * saut de page. Avec une seule feuille et sans `documentTitle`, la sortie est
 * celle de l'ancien `printAttendance`.
 */
export function buildAttendanceSheetsHtml(sheets: AttendanceSheet[], documentTitle?: string): string {
  const title = documentTitle ?? `Appel — ${sheets[0]?.tour.title ?? ""}`;
  const body = sheets
    .map((sheet, i) => {
      const inner = sheetBody(sheet);
      // Pas de saut après la dernière feuille : sinon l'impression sort une
      // page blanche en fin de document.
      return i < sheets.length - 1
        ? `<section style="page-break-after:always">${inner}\n  </section>`
        : inner;
    })
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title></head><body style="font-family:sans-serif;padding:20px">${body}
  </body></html>`;
}

export function printHtml(html: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export function printAttendanceSheets(sheets: AttendanceSheet[], documentTitle?: string): void {
  if (sheets.length === 0) return;
  printHtml(buildAttendanceSheetsHtml(sheets, documentTitle));
}

/** Sérialisation CSV commune : BOM ajouté au téléchargement, pas ici. */
export function buildCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((c) => `"${escapeCsvCell(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function buildRegistrationsCsv(registrations: any[]): string {
  return buildCsv([
    ["Nom", "Prénom", "Email", "Accompagnants", "Places", "Statut"],
    ...registrations.map((r) => [
      r.lastName,
      r.firstName,
      r.email,
      companionsCell(r),
      String(placesOf(r)),
      r.status,
    ]),
  ]);
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM : sans lui Excel FR ouvre l'UTF-8 en latin-1 et casse les accents.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRegistrationsCsv(tour: Tour, registrations: any[]): void {
  downloadCsv(
    `inscrits-${tour.title.replace(/[^a-z0-9]/gi, "-")}.csv`,
    buildRegistrationsCsv(registrations)
  );
}

// ---------------------------------------------------------------------------
// Export global (toutes visites) — bouton « Exporter inscriptions » du dashboard
// ---------------------------------------------------------------------------

export interface ExportEntry {
  tour: Tour;
  registrations: any[];
  /** Entrées de file d'attente (réponse guide), incluses seulement sur demande. */
  waitlist?: any[];
}

const FULL_HEADER = [
  "Visite",
  "Date",
  "Heure",
  "Nom",
  "Prénom",
  "Email",
  "Accompagnants",
  "Places",
  "Statut",
  "Inscrit le",
];

function frDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

function frTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function waitlistStatus(w: any): string {
  if (w.rejectedAt) return "file d'attente (offre expirée)";
  if (w.hasOffer) return "file d'attente (offre envoyée)";
  return `file d'attente (position ${w.position})`;
}

/**
 * CSV multi-visites. Une ligne par inscription ; les accompagnants restent dans
 * leur colonne, comme dans l'export par visite, pour ne pas dérouter.
 *
 * Les inscriptions annulées n'y figurent pas : l'API d'appel ne les renvoie
 * pas (elles n'occupent plus de place, cf. api/visit-attendance.ts).
 */
export function buildFullRegistrationsCsv(
  entries: ExportEntry[],
  opts: { includeWaitlist?: boolean } = {}
): string {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.tour.date).getTime() - new Date(b.tour.date).getTime()
  );

  const rows: string[][] = [FULL_HEADER];

  for (const { tour, registrations, waitlist } of sorted) {
    const date = frDate(tour.date);
    const time = frTime(tour.date);

    for (const r of registrations) {
      rows.push([
        tour.title,
        date,
        time,
        r.lastName,
        r.firstName,
        r.email,
        companionsCell(r),
        String(placesOf(r)),
        r.status,
        frDate(r.createdAt),
      ]);
    }

    if (opts.includeWaitlist) {
      for (const w of waitlist || []) {
        rows.push([
          tour.title,
          date,
          time,
          w.lastName,
          w.firstName,
          w.email,
          companionsCell(w),
          String(w.places ?? 1),
          waitlistStatus(w),
          "",
        ]);
      }
    }
  }

  return buildCsv(rows);
}

/** Ligne de commentaire finale listant les visites qu'on n'a pas pu charger. */
export function appendFailedToursNote(csv: string, failedTitles: string[]): string {
  if (failedTitles.length === 0) return csv;
  return `${csv}\n${buildCsv([[`Visites non exportées (erreur de chargement) : ${failedTitles.join(" / ")}`]])}`;
}

/**
 * `Promise.all` borné : sur « toutes les visites » le fan-out peut atteindre
 * quelques dizaines de requêtes, qu'on ne veut pas lancer d'un coup.
 * `onProgress` est appelé après chaque élément terminé.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
