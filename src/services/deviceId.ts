// Identifiant anonyme dédié aux favoris.
// Cet ID n'apparaît jamais dans un chemin lisible publiquement, contrairement
// aux identifiants qui seraient exposés en lecture publique RTDB : il ne peut
// donc pas être récolté.

const STORAGE_KEY = 'favorites-device-id';

// Mémoïsation module : en navigation privée (setItem jette), l'ID reste
// stable pour toute la session au lieu de changer à chaque appel.
let memoizedId: string | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    // Indisponible en contexte non sécurisé (dev LAN http) et iOS < 15.4
    return crypto.randomUUID();
  }
  return `fav_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getFavoritesDeviceId(): string {
  if (memoizedId) return memoizedId;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      memoizedId = stored;
      return stored;
    }
  } catch {
    // localStorage inaccessible — on continue avec un ID de session
  }

  const id = generateId();
  memoizedId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Navigation privée : l'ID vivra le temps de la session (mémoïsé)
  }
  return id;
}

export function _resetDeviceIdForTests(): void {
  memoizedId = null;
}
