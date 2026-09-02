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

export async function rtdbToursListFuture(): Promise<Tour[]> {
  const tours = await rtdbToursListAll();
  const now = new Date();
  return tours.filter((t) => {
    const tourStart = new Date(t.date);
    return tourStart > now && !t.deletedAt;
  });
}

export async function rtdbToursCompleted(): Promise<Tour[]> {
  const tours = await rtdbToursListAll();
  const now = new Date();
  return tours.filter((t) => {
    const tourEnd = new Date(new Date(t.date).getTime() + t.durationMinutes * 60 * 1000);
    return tourEnd < new Date(now.getTime() - 24 * 60 * 60 * 1000) && !t.batchDeleteExecuted && !t.deletedAt;
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
    status: input.status || "attente_validation",
    validationToken: input.validationToken,
    validationExpiresAt: input.validationExpiresAt,
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
    validationToken: undefined,
    deletedAt: reg.deletedAt || new Date().toISOString(),
  };
  await rtdbPut(`registrations/${regId}`, erased);
}

// Une inscription ne bloque la réinscription que si elle occupe (ou peut encore
// occuper) une place : annulée → réinscription permise (les emails le promettent),
// attente_validation expirée → idem (elle sera annulée au prochain sweep).
export async function rtdbRegistrationExists(tourId: string, email: string): Promise<boolean> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_email/${emailKey(email)}`);
  if (!regs) return false;
  const now = Date.now();
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (!reg || reg.tourId !== tourId || reg.deletedAt) continue;
    if (reg.status === "annulé") continue;
    if (
      reg.status === "attente_validation" &&
      reg.validationExpiresAt &&
      new Date(reg.validationExpiresAt).getTime() <= now
    )
      continue;
    return true;
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

// Compte les PLACES occupées (titulaire + accompagnants) par les inscriptions
// qui occupent réellement un siège : confirmé, présent, OU en attente de validation
// non expirée (la place est réservée pendant le délai de confirmation email).
// L'appel ne libère pas la place.
export async function rtdbCountRegisteredByTour(tourId: string): Promise<number> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_tour/${tourId}`);
  if (!regs) return 0;
  let places = 0;
  const now = Date.now();
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (!reg || reg.deletedAt) continue;
    if (reg.status === "confirmé" || reg.status === "présent") {
      places += placesOf(reg);
    } else if (
      reg.status === "attente_validation" &&
      reg.validationExpiresAt &&
      new Date(reg.validationExpiresAt).getTime() > now
    ) {
      places += placesOf(reg);
    }
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
