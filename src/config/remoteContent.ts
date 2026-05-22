// Configuration pour la synchronisation du programme via Google Sheets.
// Les organisateurs éditent les Sheets ; l'app lit le CSV exporté au lancement.

export type RemoteSheetConfig = {
  id: string;
  gid: string;
};

export const REMOTE_SHEETS = {
  expositions: {
    id: "1vplrT7GpDU7cJcIYmFMpZ5CUEj0bCE6owhwt0rdaKos",
    gid: "151344496",
  },
  concerts: {
    id: "1bGPyPmm0BLo23JTZ_zMn_OY6x88nrUBfnpIKCTAVl2U",
    gid: "1948932501",
  },
} as const satisfies Record<string, RemoteSheetConfig>;

export function buildCsvUrl({ id, gid }: RemoteSheetConfig): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

export const REMOTE_FETCH_TIMEOUT_MS = 8000;
// Au-delà de cette durée, le cache est considéré périmé : la prochaine
// `loadProgram()` fait un fetch bloquant. En-dessous, on sert le cache et
// on déclenche un refresh en arrière-plan.
export const REMOTE_CACHE_TTL_MS = 60 * 60 * 1000;
// Polling automatique toutes les heures tant que l'app est ouverte.
export const REMOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const REMOTE_CACHE_VERSION = 1;
export const REMOTE_CACHE_KEY = `remoteProgram:v${REMOTE_CACHE_VERSION}`;

// Créneaux horaires valides pour les concerts (cf. Google Sheet).
export const CONCERT_TIME_SLOTS = [
  "14:00 - 14:30",
  "14:45 - 15:15",
  "15:30 - 16:00",
  "16:00 - 16:45",
  "17:00 - 17:30",
  "17:45 - 18:15",
  "18:30 - 19:00",
] as const;

export const EXPO_DEFAULT_TIME = "12h00 - 19h00, samedi et dimanche";
