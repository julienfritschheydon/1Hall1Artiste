// Sync des favoris vers /api/favorites (Firebase RTDB côté serveur).
//
// Principes :
// - localStorage reste la source de vérité des lectures ; le serveur est un backup.
// - Fire-and-forget : aucun échec réseau ne remonte à l'UI.
// - Push quasi-immédiat (coalescing court) : un debounce long perdrait le dernier
//   favori sur un swipe-kill iOS (aucun événement de fermeture n'est émis).
// - Union uniquement au boot et au recover, jamais en cours de session
//   (anti-résurrection des suppressions).

import { replaceSavedEvents } from "./savedEvents";
import { replaceSavedLocations } from "./savedLocations";
import { getFavoritesDeviceId } from "./deviceId";
import { dataService } from "./dataService";

const API_URL = "/api/favorites";
const EVENTS_KEY = "savedEvents";
const LOCATIONS_KEY = "savedLocations";
const RECOVERY_EMAIL_KEY = "favorites-recovery-email";
const COALESCE_MS = 300;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS = 300;

let initialized = false;
let applyingMerge = false;
let pendingPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight: Promise<void> | null = null;
let unionInFlight: Promise<void> | null = null;
let localChangedDuringPull = false;
let lastPushedSnapshot = "";

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function mergeFavorites(local: unknown, remote: unknown): string[] {
  const a = Array.isArray(local) ? local.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
  const b = Array.isArray(remote) ? remote.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
  return Array.from(new Set([...a, ...b]));
}

function getKnownEmail(): string | null {
  try {
    return localStorage.getItem(RECOVERY_EMAIL_KEY);
  } catch {
    return null;
  }
}

// Snapshot TOUJOURS relu de localStorage à l'instant de l'envoi
function buildPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    deviceId: getFavoritesDeviceId(),
    events: readIds(EVENTS_KEY).slice(0, MAX_ITEMS),
    locations: readIds(LOCATIONS_KEY).slice(0, MAX_ITEMS),
  };
  const email = getKnownEmail();
  if (email) payload.email = email;
  return payload;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function doPush(): Promise<void> {
  const payload = buildPayload();
  const snapshot = JSON.stringify(payload);
  try {
    const res = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
    });
    if (res.ok) {
      pendingPush = false;
      lastPushedSnapshot = snapshot;
    } else {
      pendingPush = true;
    }
  } catch {
    pendingPush = true;
  }
}

export async function pushNow(): Promise<void> {
  // Sérialisation : un seul push in-flight ; le suivant attend puis relit le snapshot
  while (pushInFlight) {
    await pushInFlight.catch(() => undefined);
  }
  pushInFlight = doPush();
  try {
    await pushInFlight;
  } finally {
    pushInFlight = null;
  }
}

function schedulePush(): void {
  pendingPush = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, COALESCE_MS);
}

function onLocalChange(): void {
  if (applyingMerge) return;
  localChangedDuringPull = true;
  schedulePush();
}

function applyMerge(events: string[], locations: string[]): void {
  applyingMerge = true;
  try {
    replaceSavedEvents(events);
    replaceSavedLocations(locations);
  } finally {
    applyingMerge = false;
  }
}

// Union sérialisée (boot pull ET recover partagent ce mutex) ; l'union est
// recalculée sur le localStorage frais juste avant écriture.
async function runUnion(task: () => Promise<void>): Promise<void> {
  while (unionInFlight) {
    await unionInFlight.catch(() => undefined);
  }
  unionInFlight = task();
  try {
    await unionInFlight;
  } finally {
    unionInFlight = null;
  }
}

async function bootPull(): Promise<void> {
  await runUnion(async () => {
    localChangedDuringPull = false;
    let remote: { events?: unknown; locations?: unknown } | null = null;
    try {
      const res = await fetchWithTimeout(`${API_URL}?deviceId=${encodeURIComponent(getFavoritesDeviceId())}`);
      if (res.ok) remote = await res.json();
    } catch {
      return; // hors ligne / API absente en dev — silencieux
    }
    if (!remote) return;

    if (localChangedDuringPull) {
      // Anti-résurrection : une modification locale (ex. suppression) a eu lieu
      // pendant le GET en vol — on abandonne l'union et on pousse le local.
      void pushNow();
      return;
    }

    const mergedEvents = mergeFavorites(readIds(EVENTS_KEY), remote.events);
    const mergedLocations = mergeFavorites(readIds(LOCATIONS_KEY), remote.locations);
    const changed =
      JSON.stringify(mergedEvents) !== JSON.stringify(readIds(EVENTS_KEY)) ||
      JSON.stringify(mergedLocations) !== JSON.stringify(readIds(LOCATIONS_KEY));

    if (changed) applyMerge(mergedEvents, mergedLocations);
    void pushNow();
  });
}

export type RecoverResult =
  | { status: "ok"; newEvents: number; newLocations: number }
  | { status: "not_found" }
  | { status: "network_error" };

export async function recoverByEmail(rawEmail: string): Promise<RecoverResult> {
  const email = rawEmail.toLowerCase().trim();
  let result: RecoverResult = { status: "network_error" };

  await runUnion(async () => {
    let remote: { found?: boolean; events?: unknown; locations?: unknown };
    try {
      const res = await fetchWithTimeout(`${API_URL}?email=${encodeURIComponent(email)}`);
      if (!res.ok) return;
      remote = await res.json();
    } catch {
      return;
    }

    if (!remote.found) {
      result = { status: "not_found" };
      return;
    }

    const localEvents = readIds(EVENTS_KEY);
    const localLocations = readIds(LOCATIONS_KEY);
    const mergedEvents = mergeFavorites(localEvents, remote.events);
    const mergedLocations = mergeFavorites(localLocations, remote.locations);
    const newEvents = mergedEvents.length - localEvents.length;
    const newLocations = mergedLocations.length - localLocations.length;

    if (newEvents > 0 || newLocations > 0) applyMerge(mergedEvents, mergedLocations);

    try {
      localStorage.setItem(RECOVERY_EMAIL_KEY, email);
    } catch { /* navigation privée */ }

    // Attach : le prochain push inclut l'email → l'index accumule ce device
    void pushNow();
    result = { status: "ok", newEvents, newLocations };
  });

  return result;
}

export async function attachEmail(rawEmail: string): Promise<boolean> {
  const email = rawEmail.toLowerCase().trim();
  try {
    localStorage.setItem(RECOVERY_EMAIL_KEY, email);
  } catch { /* navigation privée */ }
  try {
    const res = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildPayload(), email }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function detachEmail(): Promise<boolean> {
  try {
    localStorage.removeItem(RECOVERY_EMAIL_KEY);
  } catch { /* navigation privée */ }
  try {
    const res = await fetchWithTimeout(`${API_URL}?deviceId=${encodeURIComponent(getFavoritesDeviceId())}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getAttachedEmail(): string | null {
  return getKnownEmail();
}

function flushOnHide(): void {
  if (!pendingPush && !pushTimer) return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const payload = buildPayload();
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    // Le type du Blob EST le Content-Type — sans lui le body arrive en string non parsée
    const ok = navigator.sendBeacon(API_URL, new Blob([JSON.stringify(payload)], { type: "application/json" }));
    if (ok) pendingPush = false; // anti re-push au retour bfcache
  } else {
    // Fallback best-effort (vieux navigateurs)
    void pushNow();
  }
}

export function initFavoritesSync(): void {
  if (initialized) return; // StrictMode / HMR
  initialized = true;

  window.addEventListener("savedEventsChanged", onLocalChange);
  window.addEventListener("savedLocationsChanged", onLocalChange);

  // Multi-onglets : storage ne fire pas dans l'onglet écrivain. Re-push
  // seulement si le contenu diffère du dernier snapshot poussé.
  window.addEventListener("storage", (e) => {
    if (applyingMerge) return;
    if (e.key !== EVENTS_KEY && e.key !== LOCATIONS_KEY) return;
    if (JSON.stringify(buildPayload()) === lastPushedSnapshot) return;
    schedulePush();
  });

  window.addEventListener("online", () => {
    if (pendingPush) void pushNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushOnHide();
    } else if (pendingPush) {
      void pushNow();
    }
  });
  window.addEventListener("pagehide", flushOnHide);

  // Rafraîchir l'UI quand le programme distant est appliqué (au premier boot à
  // froid, getSavedEvents() filtre tout tant que dataService est vide).
  // Inutile si le programme est déjà chargé (cache).
  const unsubscribe = dataService.getEvents().length > 0 ? () => undefined : dataService.subscribe((state) => {
    if (state.events && state.events.length > 0) {
      unsubscribe();
      if (readIds(EVENTS_KEY).length > 0) {
        applyingMerge = true;
        try {
          window.dispatchEvent(new CustomEvent("savedEventsChanged"));
        } finally {
          applyingMerge = false;
        }
      }
    }
  });

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    void bootPull();
  } else {
    const onBackOnline = () => {
      window.removeEventListener("online", onBackOnline);
      void bootPull();
    };
    window.addEventListener("online", onBackOnline);
  }
}

export function _resetForTests(): void {
  initialized = false;
  applyingMerge = false;
  pendingPush = false;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pushInFlight = null;
  unionInFlight = null;
  localChangedDuringPull = false;
  lastPushedSnapshot = "";
}
