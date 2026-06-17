// Doodates (Visites Guidées) - RTDB helpers + queries
// Utilise api/_firebase.ts pour accès RTDB (secrets admin)

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
    date: input.date,
    durationMinutes: input.durationMinutes,
    startLocationLat: input.startLocationLat,
    startLocationLng: input.startLocationLng,
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
  // Index by email
  await rtdbPut(`registrations_by_email/${input.email}/${id}`, true);
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

export async function rtdbRegistrationExists(tourId: string, email: string): Promise<boolean> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_email/${email}`);
  if (!regs) return false;
  // Check if any registration for this tour
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (reg && reg.tourId === tourId && !reg.deletedAt) return true;
  }
  return false;
}

export async function rtdbCountUserTours(email: string): Promise<number> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_email/${email}`);
  if (!regs) return 0;
  let count = 0;
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (reg && (reg.status === "confirmé" || reg.status === "présent") && !reg.deletedAt) count++;
  }
  return count;
}

// Compte les PLACES occupées (titulaire + accompagnants) par les inscriptions confirmées.
export async function rtdbCountRegisteredByTour(tourId: string): Promise<number> {
  const regs = await rtdbGet<Record<string, boolean>>(`registrations_by_tour/${tourId}`);
  if (!regs) return 0;
  let places = 0;
  for (const regId of Object.keys(regs)) {
    const reg = await rtdbRegistrationGet(regId);
    if (reg && reg.status === "confirmé" && !reg.deletedAt) places += placesOf(reg);
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
  // Index by tour
  await rtdbPut(`waitlist_by_tour/${input.tourId}/${input.position}`, id);
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

export async function rtdbWaitlistCount(tourId: string): Promise<number> {
  const waitlists = await rtdbGet<Record<string, string>>(`waitlist_by_tour/${tourId}`);
  if (!waitlists) return 0;
  let count = 0;
  for (const waitId of Object.values(waitlists)) {
    const wait = await rtdbWaitlistGet(waitId);
    if (wait && !wait.deletedAt && !wait.rejectedAt) count++;
  }
  return count;
}

export async function rtdbWaitlistListByTour(tourId: string): Promise<Waitlist[]> {
  const waitlists = await rtdbGet<Record<string, string>>(`waitlist_by_tour/${tourId}`);
  if (!waitlists) return [];
  const result: Waitlist[] = [];
  for (const waitId of Object.values(waitlists)) {
    const wait = await rtdbWaitlistGet(waitId);
    if (wait && !wait.deletedAt) result.push(wait);
  }
  // Sort by position
  return result.sort((a, b) => a.position - b.position);
}

export async function rtdbWaitlistGetNext(tourId: string): Promise<Waitlist | null> {
  const waits = await rtdbWaitlistListByTour(tourId);
  return waits.length > 0 ? waits[0] : null;
}

export async function rtdbWaitlistReorderAfter(tourId: string, position: number): Promise<void> {
  const waits = await rtdbWaitlistListByTour(tourId);
  for (const wait of waits) {
    if (wait.position > position) {
      await rtdbWaitlistUpdate(wait.id, { position: wait.position - 1 });
    }
  }
}

// ============ ATTENDANCE ============

export async function rtdbAttendanceCreate(input: {
  registrationId: string;
  tourId: string;
  present: boolean;
  markedAt: string;
  markedByGuide: string;
}): Promise<Attendance> {
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
  const code = Math.random().toString(36).substr(2, 12).toUpperCase();
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
