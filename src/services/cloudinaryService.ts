/**
 * Service de galerie communautaire - Cloudinary + Firebase
 */

import { CommunityEntry, SubmissionParams } from "../types/communityTypes";

// Configuration Cloudinary
const CLOUDINARY_CLOUD_NAME = 'dpatqkgsc';
const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}`;

// Configuration Firebase Realtime Database
const FIREBASE_CONFIG = {
  databaseURL: "https://collectif-ile-feydeau----app-default-rtdb.europe-west1.firebasedatabase.app"
};

export async function fetchCommunityEntries(): Promise<CommunityEntry[]> {
  try {
    // Nettoyage initial avec protection localStorage
    let isFirstLoad = false;
    try {
      isFirstLoad = !localStorage.getItem('cloudinary_revolution_started');
      if (isFirstLoad) {
        localStorage.removeItem('community_entries');
        localStorage.setItem('cloudinary_revolution_started', 'true');
        console.log('[CloudinaryService] Système initialisé');
      }
    } catch (storageError) {
      console.warn('[CloudinaryService] Erreur localStorage:', storageError);
      // Continuer sans localStorage si indisponible
    }
    
    const response = await fetch(`${FIREBASE_CONFIG.databaseURL}/community-photos.json`);
    
    if (!response.ok) {
      console.error('[CloudinaryService] Erreur API:', response.status);
      return [];
    }
    
    const firebaseData = await response.json();
    const firebaseEntries = firebaseData ? Object.values(firebaseData) as CommunityEntry[] : [];
    
    console.log(`[CloudinaryService] ${firebaseEntries.length} photos chargées`);
    
    return firebaseEntries.sort((a: CommunityEntry, b: CommunityEntry) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
  } catch (error) {
    console.error('[CloudinaryService] Erreur:', error);
    return [];
  }
}

/**
 * 🗑️ RÉVOLUTION : Effacer toutes les anciennes contributions
 */
export function clearAllContributions(): void {
  console.log('[CloudinaryService] 🗑️ TABLE RASE : Suppression de toutes les contributions !');
  try {
    localStorage.removeItem('community_entries');
    console.log('[CloudinaryService] ✅ Toutes les contributions supprimées ! Nouveau départ !');
  } catch (storageError) {
    console.warn('[CloudinaryService] Erreur suppression localStorage:', storageError);
  }
}

/**
 * ⚡ Soumission instantanée (0 seconde !)
 */
export async function submitContribution(params: SubmissionParams): Promise<CommunityEntry> {
  const finalImageUrl = params.cloudinaryUrl || params.imageUrl;

  // Écriture déléguée au serveur (/api/community) : les règles RTDB restent en .write:false.
  const response = await fetch(`/api/community`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: params.displayName,
      content: params.content,
      imageUrl: finalImageUrl,
      description: params.description,
    })
  });

  if (!response.ok) {
    throw new Error('Impossible de sauvegarder la photo. Vérifiez votre connexion.');
  }

  const newEntry: CommunityEntry = await response.json();
  console.log('[CloudinaryService] Contribution sauvegardée');
  return newEntry;
}

/**
 * 🗑️ Suppression (modération) — nécessite la clé de modération (x-mod-key).
 * La clé est saisie par l'admin et stockée en sessionStorage.
 */
export async function deleteCommunityEntry(entryId: string): Promise<void> {
  const modKey = (() => { try { return sessionStorage.getItem('moderationKey') || ''; } catch { return ''; } })();
  const response = await fetch(`/api/community?id=${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    headers: { 'x-mod-key': modKey }
  });

  if (response.status === 401) {
    throw new Error('Clé de modération manquante ou invalide.');
  }
  if (!response.ok) {
    throw new Error('Impossible de supprimer la photo');
  }

  console.log('[CloudinaryService] ✅ Contribution supprimée');
}

