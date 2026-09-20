// Doodates (Visites Guidées) - RTDB helpers + queries
// Utilise api/_firebase.ts pour accès RTDB (secrets admin)

import { randomInt } from "crypto";
import { rtdbGet, rtdbPut, rtdbDelete } from "./_firebase.js";
import {
  Tour,
  Registration,
  Waitlist,
  Attendance,
  GuideAccessCode,
  AuditLog,
  TourCreateInput,
  RegistrationCreateInput,
  WaitlistCreateInput,
  placesOf,
} from "../src/types/visitTypes.js";

// UUID helper
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Firebase RTDB keys cannot contain . # $ [ ] /  (and the REST URL decodes %xx,
// so percent-encoding doesn't help). Replace illegal chars with ',' (legal). '@' is OK.
// Index-only key — real email lives in the doc — so collisions are harmless.
export function emailKey(email: string): string {
  return email.toLowerCase().replace(/[.#$[\]/]/g, ",");
}

// ============ TOURS ============

export async function rtdbTourGet(tourId: string): Promise<Tour | null> {
  return rtdbGet<Tour>(`tours/${tourId}`);
}

export async function rtdbTourCreate(input: TourCreateInput): Promise<Tour> {
  const id = generateId();
  const now = new Date().toISOString();
  const tour: Tour = {
    id,
    guideId: input.guideId || "all-guides",
    title: input.title,
    description: input.description,
    date: input.date,
    durationMinutes: input.durationMinutes,
    startLocationX: input.startLocationX,
    startLocationY: input.startLocationY,
    startLocationName: input.startLocationName,
    startLocationId: input.startLocationId,
    capacity: input.capacity,
    ...(input.overbookingSeats ? { overbookingSeats: input.overbookingSeats } : {}),
    labels: input.labels,
    status: input.status || "upcoming",
    createdAt: now,
    updatedAt: now,
  };
  await rtdbPut(`tours/${id}`, tour);
  return tour;
}

export async function rtdbTourUpdate(tourId: string, updates: Partial<Tour>): Promise<void> {
  const tour = await rtdbTourGet(tourId);
  if (!tour) throw new Error(`Tour ${tourId} not found`);
  const updated = { ...tour, ...updates, updatedAt: new Date().toISOString() };
  await rtdbPut(`tours/${tourId}`, updated);
}

export async function rtdbToursListAll(): Promise<Tour[]> {
  const tours = await rtdbGet<Record<string, Tour>>("tours");
  return Object.values(tours || {}).filter((t) => !t.deletedAt);
}

// Visites encore d'actualité pour le public : à venir ET en cours. Une visite
// disparaissait à la seconde de son départ, au moment précis où un visiteur sur
// place la cherche ; elle reste visible jusqu'à sa fin, l'inscription étant de
// toute façon refusée dès le départ (visit-register).
export async function rtdbToursListFuture(): Promise<Tour[]> {
  const tours = await rtdbToursListAll();
  const now = Date.now();
  return tours.filter((t) => {
    const end = new Date(t.date).getTime() + (t.durationMinutes || 0) * 60 * 1000;
    return end > now && !t.deletedAt;
  });
}

/**
 * Délai de conservation des inscriptions après la fin d'une visite, en jours.
 *
 * Il était de 1 jour, ce qui était trop court pour deux raisons concrètes :
 *  - le festival dure plusieurs jours, donc les inscrits du samedi étaient
 *    effacés alors que l'événement battait encore son plein ;
 *  - un guide qui fait son appel le lundi pour une visite du samedi trouvait
 *    une feuille vide, et la fréquentation réelle était perdue.
 *
 * 30 jours laisse le temps de finir un appel, de traiter une réclamation ou de
 * retrouver quelqu'un qui a perdu un objet, tout en restant une durée
 * manifestement limitée au regard du RGPD. Le bilan chiffré anonyme, lui, est
 * écrit avant la purge et conservé sans limite : allonger ce délai ne sert donc
 * pas les statistiques, uniquement le traitement des cas individuels.
 *
 * Surchargeable par VISIT_RETENTION_DAYS sans redéploiement du code.
 */
export const DEFAULT_RETENTION_DAYS = 30;

export function retentionDays(): number {
  const raw = process.env.VISIT_RETENTION_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;

  const parsed = Number(raw);
  // Une valeur illisible ou absurde ne doit surtout pas se traduire par une
  // purge immédiate : on retombe sur la valeur par défaut, bruyamment.
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error(
      `[visit-db] VISIT_RETENTION_DAYS invalide (« ${raw} ») — repli sur ${DEFAULT_RETENTION_DAYS} jours.`
    );
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

/** Visites dont les inscriptions ont dépassé le délai de conservation. */
export async function rtdbToursCompleted(): Promise<Tour[]> {
  const tours = await rtdbToursListAll();
  const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
  return tours.filter((t) => {
    const start = new Date(t.date).getTime();
    // Date corrompue : on ne purge pas. Un NaN rendrait la comparaison fausse
    // et laisserait le document en place de toute façon, mais autant que
    // l'intention soit explicite plutôt que le fruit d'un hasard.
    if (isNaN(start)) return false;
    const tourEnd = start + (t.durationMinutes || 0) * 60 * 1000;
    return tourEnd < cutoff && !t.batchDeleteExecuted && !t.deletedAt;
  });
}

// ============ REGISTRATIONS ============

export async function rtdbRegistrationGet(regId: string): Promise<Registration | null> {
  return rtdbGet<Registration>(`registrations/${regId}`);
}

export async function rtdbRegistrationCreate(input: RegistrationCreateInput): Promise<Registration> {
  const id = generateId();
  const now = new Date().toISOString();
  const reg: Registration = {
    id,
    tourId: input.tourId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    companions: input.companions,
    companionFirstName: input.companionFirstName,
    companionLastName: input.companionLastName,
    status: input.status || "confirmé",
    createdAt: now,
  };
  await rtdbPut(`registrations/${id}`, reg);
  // Index by tour
  await rtdbPut(`registrations_by_tour/${input.tourId}/${id}`, true);
  // Index by email (encoded: emails contain '.', illegal in RTDB keys)
  await rtdbPut(`registrations_by_email/${emailKey(input.email)}/${id}`, true);
  return reg;
}

export async function rtdbRegistrationUpdate(regId: string, updates: Partial<Registration>): Promise<void> {
  const reg = await rtdbRegistrationGet(regId);
  if (!reg) throw new Error(`Registration ${regId} not found`);
  const updated = { ...reg, ...updates };
  await rtdbPut(`registrations/${regId}`, updated);
}

export async function rtdbRegistrationSoftDelete(regId: string): Promise<void> {
  const reg = await rtdbRegistrationGet(regId);
  if (!reg) return; // Already deleted or not found
  const updated = { ...reg, deletedAt: new Date().toISOString() };
  await rtdbPut(`registrations/${regId}`, updated);
}

// Effacement RGPD : le soft delete seul laisse email/noms en base indéfiniment.
// On garde le squelette (tourId, statut, dates) pour les stats, on purge les
// données personnelles et l'entrée d'index email (sinon la personne resterait
// « déjà inscrite » sans plus aucune donnée pour le prouver).
export async function rtdbRegistrationErase(regId: string): Promise<void> {
  const reg = await rtdbRegistrationGet(regId);
  if (!reg) return;
  await rtdbDelete(`registrations_by_email/${emailKey(reg.email)}/${regId}`);
  const erased: Registration = {
    ...reg,
    email: "rgpd@supprimé",
    firstName: "Supprimé",
    lastName: "RGPD",
    companions: undefined,
    companionFirstName: undefined,
    companionLastName: undefined,
    deletedAt: reg.deletedAt || new Date().toISOString(),
  };
  await rtdbPut(`registrations/${regId}`, erased);
}

// Une inscription ne bloque la réinscription que si elle occupe réellement une
// place. Annulée → réinscription permise (les emails le promettent). Tout
// statut hérité inconnu (notamment l'ancien « attente_validation », dont le
// jeton a expiré depuis longtemps) ne bloque rien non plus.
export async function rtdbRegistrationExists(tourId: string, email: string): Promise<boolean> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_email/${emailKey(email)}`);
  if (!regs) return false;
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (!reg || reg.tourId !== tourId || reg.deletedAt) continue;
    if (holdsSeat(reg)) return true;
  }
  return false;
}

export async function rtdbCountUserTours(email: string): Promise<number> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_email/${emailKey(email)}`);
  if (!regs) return 0;
  let count = 0;
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (reg && (reg.status === "confirmé" || reg.status === "présent") && !reg.deletedAt) count++;
  }
  return count;
}

// Une inscription occupe-t-elle réellement une place ? Source unique de vérité,
// partagée par le comptage de capacité, le blocage de réinscription et la
// feuille d'appel — ces trois endroits divergeaient auparavant, chacun avec sa
// propre liste de statuts.
//
// « présent » et « absent » comptent : ils décrivent une visite déjà faite,
// pas une place à réattribuer.
export function holdsSeat(reg: { status: string; deletedAt?: string }): boolean {
  if (reg.deletedAt) return false;
  return reg.status === "confirmé" || reg.status === "présent" || reg.status === "absent";
}

// Compte les PLACES occupées (titulaire + accompagnants) sur une visite.
export async function rtdbCountRegisteredByTour(tourId: string): Promise<number> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_tour/${tourId}`);
  if (!regs) return 0;
  let places = 0;
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (!reg || !holdsSeat(reg)) continue;
    places += placesOf(reg);
  }
  return places;
}

export async function rtdbRegistrationsListByTour(tourId: string): Promise<Registration[]> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_tour/${tourId}`);
  if (!regs) return [];
  const result: Registration[] = [];
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (reg && !reg.deletedAt) result.push(reg);
  }
  return result;
}

// Toutes les inscriptions vivantes, groupées par visite, en UNE lecture.
//
// `rtdbRegistrationsListByTour` lit l'index puis chaque document un par un :
// c'est un aller-retour réseau par inscrit. Le portail guide, qui affiche tout
// le programme, en déclenchait plusieurs centaines à chaque ouverture. Ici on
// lit le nœud entier une fois et on trie en mémoire — le volume reste modeste
// (quelques milliers de documents au plus, purgés après le délai de
// conservation, cf. DEFAULT_RETENTION_DAYS),
// sans commune mesure avec le coût de la rafale de requêtes qu'il remplace.
export async function rtdbRegistrationsGroupedByTour(): Promise<Map<string, Registration[]>> {
  const all = await rtdbGet<Record<string, Registration>>("registrations");
  const grouped = new Map<string, Registration[]>();
  for (const reg of Object.values(all || {})) {
    if (!reg || reg.deletedAt || !reg.tourId) continue;
    const list = grouped.get(reg.tourId);
    if (list) list.push(reg);
    else grouped.set(reg.tourId, [reg]);
  }
  return grouped;
}

/** Pendant de `rtdbRegistrationsGroupedByTour` pour la file d'attente. */
export async function rtdbWaitlistGroupedByTour(): Promise<Map<string, Waitlist[]>> {
  const all = await rtdbGet<Record<string, Waitlist>>("waitlist");
  const grouped = new Map<string, Waitlist[]>();
  for (const wait of Object.values(all || {})) {
    if (!wait || wait.deletedAt || !wait.tourId) continue;
    const list = grouped.get(wait.tourId);
    if (list) list.push(wait);
    else grouped.set(wait.tourId, [wait]);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.position - b.position || (a.createdAt || "").localeCompare(b.createdAt || ""));
  }
  return grouped;
}

export async function rtdbRegistrationsListByDateRange(
  startDate: Date,
  endDate: Date
): Promise<Registration[]> {
  const allTours = await rtdbToursListAll();
  const toursInRange = allTours.filter((t) => {
    const d = new Date(t.date);
    return d >= startDate && d <= endDate;
  });

  const result: Registration[] = [];
  for (const tour of toursInRange) {
    const regs = await rtdbRegistrationsListByTour(tour.id);
    result.push(...regs.filter((r) => r.status === "confirmé" && !r.deletedAt));
  }
  return result;
}

/**
 * Jour calendaire en heure de Paris, au format YYYY-MM-DD.
 * Les fonctions Vercel tournent en UTC : comparer des `Date` bruts fait
 * basculer de jour une visite en soirée (23h30 à Paris = 21h30 UTC la veille en
 * hiver, et le 8 août à 00h30 à Paris est encore le 7 en UTC).
 */
export function parisDayKey(d: Date): string {
  // en-CA formate en YYYY-MM-DD, ce qui rend la comparaison de jours triviale.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Inscriptions confirmées dont la visite tombe le JOUR de `targetDay` (heure de
 * Paris), quelle que soit l'heure de départ.
 *
 * Remplace une fenêtre de ±1h autour d'un instant pour les rappels J-7 et J-1.
 * Cette fenêtre ne pouvait pas fonctionner : le cron ne tourne qu'une fois par
 * jour (04:00 UTC), donc elle ne couvrait que les visites démarrant entre 03:00
 * et 05:00 UTC — 05h-07h à Paris l'été. Une visite l'après-midi n'était jamais
 * sélectionnée, et AUCUN rappel ne partait. Par ricochet `validation1dSent`
 * n'était jamais posé, donc l'auto-annulation des non-répondants ne se
 * déclenchait jamais et les places des absents n'étaient jamais rendues à la
 * file d'attente.
 *
 * NB : `rtdbRegistrationsListByDateRange` reste utilisée telle quelle par les
 * jobs qui ont réellement besoin d'une précision horaire (rappel 3h avant) et
 * par le balayage de l'auto-annulation, qui porte sur une plage de 8 jours.
 */
export async function rtdbRegistrationsListByTourDay(targetDay: Date): Promise<Registration[]> {
  const wanted = parisDayKey(targetDay);
  const allTours = await rtdbToursListAll();
  const toursOnDay = allTours.filter((t) => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false; // date corrompue : ignorée, jamais un crash du cron
    return parisDayKey(d) === wanted;
  });

  const result: Registration[] = [];
  for (const tour of toursOnDay) {
    const regs = await rtdbRegistrationsListByTour(tour.id);
    result.push(...regs.filter((r) => r.status === "confirmé" && !r.deletedAt));
  }
  return result;
}

export async function rtdbRegistrationsListByCancelledSince(since: Date): Promise<Registration[]> {
  const allRegs = await rtdbGet<Record<string, Registration>>("registrations");
  if (!allRegs) return [];
  return Object.values(allRegs).filter(
    (r) => r.status === "annulé" && r.cancelledAt && new Date(r.cancelledAt) >= since && !r.deletedAt
  );
}

export async function rtdbRegistrationsListByEmail(email: string): Promise<Registration[]> {
  const allRegs = await rtdbGet<Record<string, Registration>>("registrations");
  if (!allRegs) return [];
  return Object.values(allRegs).filter(
    (r) => r.email.toLowerCase() === email.toLowerCase() && !r.deletedAt
  );
}

// ============ WAITLIST ============

/**
 * Normalise un texte pour la recherche : minuscules, accents retirés, espaces
 * multiples réduits.
 *
 * Sans le retrait des accents, un guide qui tape « lea » ne trouve pas « Léa »
 * et conclut à tort que la personne n'est pas inscrite — exactement le cas
 * d'usage de cette recherche.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritiques
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Une personne correspond-elle à la requête ? email, prénom, nom, ou « prénom nom ». */
function matchesPerson(
  p: { email: string; firstName: string; lastName: string },
  needle: string
): boolean {
  const full = normalizeSearchText(`${p.firstName} ${p.lastName}`);
  const reversed = normalizeSearchText(`${p.lastName} ${p.firstName}`);
  return (
    normalizeSearchText(p.email).includes(needle) ||
    full.includes(needle) ||
    reversed.includes(needle)
  );
}

/**
 * Inscriptions dont l'email ou le nom contient `query`.
 *
 * Contrairement à `rtdbRegistrationsListByEmail`, la correspondance est
 * PARTIELLE et inclut les inscriptions annulées : on cherche précisément parce
 * qu'on ne sait pas ce qui s'est passé. Les documents supprimés (`deletedAt`,
 * purge RGPD) restent exclus.
 *
 * Firebase RTDB ne sait pas faire de recherche partielle : le filtrage se fait
 * en mémoire. À l'échelle du projet (quelques milliers d'inscriptions) c'est
 * sans conséquence, et c'est déjà ce que font les autres listings.
 */
export async function rtdbRegistrationsSearch(query: string): Promise<Registration[]> {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const all = await rtdbGet<Record<string, Registration>>("registrations");
  if (!all) return [];
  return Object.values(all).filter((r) => !r.deletedAt && matchesPerson(r, needle));
}

/** Entrées de file d'attente dont l'email ou le nom contient `query`. */
export async function rtdbWaitlistSearch(query: string): Promise<Waitlist[]> {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const all = await rtdbGet<Record<string, Waitlist>>("waitlist");
  if (!all) return [];
  return Object.values(all).filter((w) => !w.deletedAt && matchesPerson(w, needle));
}

export async function rtdbWaitlistGet(waitId: string): Promise<Waitlist | null> {
  return rtdbGet<Waitlist>(`waitlist/${waitId}`);
}

export async function rtdbWaitlistAdd(input: WaitlistCreateInput): Promise<Waitlist> {
  const id = generateId();
  const now = new Date().toISOString();
  const waitlist: Waitlist = {
    id,
    tourId: input.tourId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    companions: input.companions,
    companionFirstName: input.companionFirstName,
    companionLastName: input.companionLastName,
    position: input.position,
    invitationToken: input.invitationToken,
    invitationExpiresAt: input.invitationExpiresAt,
    createdAt: now,
  };
  await rtdbPut(`waitlist/${id}`, waitlist);
  // Index by tour, keyed by ID (immuable). Historiquement keyé par position :
  // les réordonnancements/rejets laissaient des clés orphelines qu'un nouvel
  // arrivant (position = count+1) écrasait, faisant disparaître silencieusement
  // une entrée vivante de la file. rtdbWaitlistListByTour lit les deux formats.
  await rtdbPut(`waitlist_by_tour/${input.tourId}/${id}`, true);
  return waitlist;
}

export async function rtdbWaitlistUpdate(waitId: string, updates: Partial<Waitlist>): Promise<void> {
  const wait = await rtdbWaitlistGet(waitId);
  if (!wait) throw new Error(`Waitlist ${waitId} not found`);
  const updated = { ...wait, ...updates };
  await rtdbPut(`waitlist/${waitId}`, updated);
}

export async function rtdbWaitlistSoftDelete(waitId: string): Promise<void> {
  const wait = await rtdbWaitlistGet(waitId);
  if (!wait) return;
  const updated = { ...wait, deletedAt: new Date().toISOString() };
  await rtdbPut(`waitlist/${waitId}`, updated);
}

// Pendant RGPD de rtdbRegistrationErase pour la file d'attente.
export async function rtdbWaitlistErase(waitId: string): Promise<void> {
  const wait = await rtdbWaitlistGet(waitId);
  if (!wait) return;
  const erased: Waitlist = {
    ...wait,
    email: "rgpd@supprimé",
    firstName: "Supprimé",
    lastName: "RGPD",
    companions: undefined,
    companionFirstName: undefined,
    companionLastName: undefined,
    invitationToken: undefined,
    deletedAt: wait.deletedAt || new Date().toISOString(),
  };
  await rtdbPut(`waitlist/${waitId}`, erased);
}

export async function rtdbWaitlistCount(tourId: string): Promise<number> {
  const waits = await rtdbWaitlistListByTour(tourId);
  return waits.filter((w) => !w.rejectedAt).length;
}

// Une entrée active (non supprimée, non rejetée) existe-t-elle déjà pour cet email ?
export async function rtdbWaitlistExists(tourId: string, email: string): Promise<boolean> {
  const waits = await rtdbWaitlistListByTour(tourId);
  return waits.some((w) => !w.rejectedAt && w.email.toLowerCase() === email.toLowerCase());
}

// Places réservées par des offres waitlist en cours (envoyées, ni acceptées ni expirées).
// Doit être soustrait de la capacité tant que l'offre court, sinon une place "en cours d'attribution"
// apparaît comme libre et un nouvel inscrit peut doubler la personne qui attend.
export async function rtdbCountPendingWaitlistOffers(tourId: string): Promise<number> {
  const waits = await rtdbWaitlistListByTour(tourId);
  const now = new Date();
  return waits
    .filter((w) => w.invitationSentAt && !w.rejectedAt && w.invitationExpiresAt && new Date(w.invitationExpiresAt) >= now)
    .reduce((sum, w) => sum + placesOf(w), 0);
}

// Places réservées par TOUTE la file d'attente (offre envoyée ou pas), pour empêcher
// qu'un nouvel inscrit ne double une personne déjà en attente simplement parce que son
// groupe est plus petit et rentrerait dans la capacité brute restante. Une entrée refusée
// (offre expirée/déclinée) ne compte plus — elle a rendu son rang.
export async function rtdbCountWaitlistedPlaces(tourId: string): Promise<number> {
  const waits = await rtdbWaitlistListByTour(tourId);
  return waits.filter((w) => !w.rejectedAt).reduce((sum, w) => sum + placesOf(w), 0);
}

export async function rtdbWaitlistListByTour(tourId: string): Promise<Waitlist[]> {
  const index = await rtdbGet<Record<string, string | boolean>>(`waitlist_by_tour/${tourId}`);
  if (!index) return [];
  // Nouveau format : clé = waitlistId, valeur = true.
  // Legacy : clé = position, valeur = waitlistId. Les deux cohabitent en base.
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(index)) {
    ids.add(typeof value === "string" ? value : key);
  }
  const result: Waitlist[] = [];
  for (const waitId of ids) {
    const wait = await rtdbWaitlistGet(waitId);
    if (wait && !wait.deletedAt) result.push(wait);
  }
  // Sort by position (créés en même temps → départage par date d'arrivée)
  return result.sort((a, b) => a.position - b.position || (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function rtdbWaitlistGetNext(tourId: string): Promise<Waitlist | null> {
  const waits = await rtdbWaitlistListByTour(tourId);
  return waits.find((w) => !w.rejectedAt) || null;
}

export async function rtdbWaitlistReorderAfter(tourId: string, position: number): Promise<void> {
  const waits = await rtdbWaitlistListByTour(tourId);
  for (const wait of waits) {
    if (wait.position > position) {
      await rtdbWaitlistUpdate(wait.id, { position: wait.position - 1 });
    }
  }
}

export async function rtdbWaitlistListByEmail(email: string): Promise<Waitlist[]> {
  const allWaits = await rtdbGet<Record<string, Waitlist>>("waitlist");
  if (!allWaits) return [];
  return Object.values(allWaits).filter(
    (w) => w.email.toLowerCase() === email.toLowerCase() && !w.deletedAt && !w.rejectedAt
  );
}

// ============ ATTENDANCE ============

// Upsert : un seul enregistrement de présence par inscription. Créer un doc à
// chaque clic laissait des doublons dont l'ordre d'itération pouvait contredire
// le statut de l'inscription (✓ puis ✗ rapides → compteurs incohérents).
export async function rtdbAttendanceUpsert(input: {
  registrationId: string;
  tourId: string;
  present: boolean;
  markedAt: string;
  markedByGuide: string;
}): Promise<Attendance> {
  const existing = await rtdbAttendanceListByTour(input.tourId);
  const prior = existing.find((a) => a.registrationId === input.registrationId);
  if (prior) {
    const updated: Attendance = { ...prior, present: input.present, markedAt: input.markedAt, markedByGuide: input.markedByGuide };
    await rtdbPut(`attendance/${prior.id}`, updated);
    return updated;
  }
  const id = generateId();
  const att: Attendance = {
    id,
    registrationId: input.registrationId,
    tourId: input.tourId,
    present: input.present,
    markedAt: input.markedAt,
    markedByGuide: input.markedByGuide,
  };
  await rtdbPut(`attendance/${id}`, att);
  await rtdbPut(`attendance_by_tour/${input.tourId}/${id}`, true);
  return att;
}

export async function rtdbAttendanceListByTour(tourId: string): Promise<Attendance[]> {
  const atts = await rtdbGet<Record<string, boolean>>(`attendance_by_tour/${tourId}`);
  if (!atts) return [];
  const result: Attendance[] = [];
  for (const attId of Object.keys(atts)) {
    const att = await rtdbGet<Attendance>(`attendance/${attId}`);
    if (att) result.push(att);
  }
  return result;
}

// ============ NOMS DES GUIDES ============
// Liste gérée par l'admin, proposée dans le formulaire de visite (champ « Animé par »).

export async function rtdbGuideNamesGet(): Promise<string[]> {
  const names = await rtdbGet<string[]>("visit_settings/guideNames");
  return Array.isArray(names) ? names.filter((n) => typeof n === "string") : [];
}

export async function rtdbGuideNamesSet(names: string[]): Promise<void> {
  await rtdbPut("visit_settings/guideNames", names);
}

// ============ GUIDE ACCESS CODES ============

export async function rtdbGuideCodeCreate(): Promise<GuideAccessCode> {
  const id = generateId();
  // CSPRNG — Math.random est prédictible (xorshift128+), inacceptable pour un code d'accès.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 12; i++) code += alphabet[randomInt(alphabet.length)];
  const now = new Date().toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const gac: GuideAccessCode = {
    id,
    code,
    createdAt: now,
    renewalDate: nextYear,
    active: true,
  };
  await rtdbPut(`guide_access_codes/${id}`, gac);
  return gac;
}

export async function rtdbGuideCodeValidate(code: string): Promise<boolean> {
  const codes = await rtdbGet<Record<string, GuideAccessCode>>("guide_access_codes");
  if (!codes) return false;
  const now = new Date();
  for (const gac of Object.values(codes)) {
    if (gac.code !== code || !gac.active) continue;
    // renewalDate optional: if present and past → expired (spec §1 annual renewal)
    if (gac.renewalDate && new Date(gac.renewalDate) < now) return false;
    return true;
  }
  return false;
}

export async function rtdbGuideCodeCreateCustom(customCode: string): Promise<GuideAccessCode> {
  const id = generateId();
  const now = new Date().toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const gac: GuideAccessCode = {
    id,
    code: customCode,
    createdAt: now,
    renewalDate: nextYear,
    active: true,
  };
  await rtdbPut(`guide_access_codes/${id}`, gac);
  return gac;
}

export async function rtdbGuideCodeRevoke(code: string): Promise<void> {
  const codes = await rtdbGet<Record<string, GuideAccessCode>>("guide_access_codes");
  if (!codes) return;
  for (const [id, gac] of Object.entries(codes)) {
    if (gac.code === code) {
      await rtdbPut(`guide_access_codes/${id}`, { ...gac, active: false });
      break;
    }
  }
}

// ============ LOCATIONS (admin-managed) ============

import type { LocationPoint } from "../src/types/visitTypes.js";

export async function rtdbLocationsList(): Promise<LocationPoint[]> {
  const locs = await rtdbGet<Record<string, LocationPoint>>("visit_locations");
  if (!locs) return [];
  return Object.entries(locs)
    .map(([id, l]) => ({ ...l, id }))
    .filter((l) => l && typeof l.x === "number" && typeof l.y === "number")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

// ============ BILAN DE FRÉQUENTATION ============
// Compteurs anonymes par visite, écrits AVANT la purge RGPD des inscriptions.
//
// Sans eux, le bilan d'une édition disparaissait avec la purge des inscriptions :
// le portail calcule ses statistiques à partir des inscriptions vivantes, et la
// purge les efface toutes. Le collectif se retrouvait sans aucun chiffre — donc
// sans moyen de régler le surbooking, qui a précisément besoin du taux
// d'absentéisme réel.
//
// Aucune donnée personnelle ici : uniquement des nombres et l'intitulé public
// de la visite. Ces enregistrements sont donc conservés sans limite de durée.

export interface TourStats {
  tourId: string;
  title: string;
  date: string;
  capacity: number;
  overbookingSeats: number;
  seatsTaken: number; // places occupées par les inscriptions (accompagnants inclus)
  present: number;
  absent: number;
  unmarked: number; // inscrits que le guide n'a pas pointés
  waitlistPlaces: number;
  recordedAt: string;
}

export async function rtdbTourStatsPut(stats: TourStats): Promise<void> {
  await rtdbPut(`visit_stats/${stats.tourId}`, stats);
}

export async function rtdbTourStatsList(): Promise<TourStats[]> {
  const all = await rtdbGet<Record<string, TourStats>>("visit_stats");
  return Object.values(all || {}).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// ============ AUDIT LOGS ============

export async function rtdbAuditLog(action: string, details: Record<string, any>): Promise<void> {
  const id = generateId();
  const log: AuditLog = {
    id,
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  await rtdbPut(`visit_audit_logs/${id}`, log);
}
