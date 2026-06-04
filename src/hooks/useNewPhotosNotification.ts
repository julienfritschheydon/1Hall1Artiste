import { useState, useEffect, useCallback } from 'react';
import { fetchCommunityEntries } from '@/services/cloudinaryService';

const STORAGE_KEY = 'lastKnownPhotosCount';
const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

export interface NewPhotosNotification {
  hasNewPhotos: boolean;
  newPhotosCount: number;
  totalPhotos: number;
  markAsViewed: () => void;
  forceCheck: () => Promise<void>;
  simulateNewPhotos: (count?: number) => void;
  resetNotification: () => void;
}

export function useNewPhotosNotification(): NewPhotosNotification {
  const [hasNewPhotos, setHasNewPhotos] = useState(false);
  const [newPhotosCount, setNewPhotosCount] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);

  // Récupérer le dernier nombre connu depuis localStorage
  const getLastKnownCount = useCallback((): number => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.warn('[NewPhotosNotification] Error reading localStorage:', error);
      return 0;
    }
  }, []);

  // Sauvegarder le nombre actuel dans localStorage
  const saveCurrentCount = useCallback((count: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, count.toString());
    } catch (error) {
      console.warn('[NewPhotosNotification] Error writing to localStorage:', error);
    }
  }, []);

  // Vérifier s'il y a de nouvelles photos
  const checkForNewPhotos = useCallback(async () => {
    try {
      const entries = await fetchCommunityEntries();
      const currentCount = entries.length;
      const lastKnownCount = getLastKnownCount();
      
      console.log(`[NewPhotosNotification] Vérification: ${currentCount} photos actuelles, ${lastKnownCount} connues`);
      
      setTotalPhotos(currentCount);
      
      if (currentCount > lastKnownCount && lastKnownCount >= 0) {
        const newCount = currentCount - lastKnownCount;
        setNewPhotosCount(newCount);
        setHasNewPhotos(true);
        console.log(`[NewPhotosNotification] 🎉 ${newCount} nouvelles photos détectées !`);
      } else if (currentCount === lastKnownCount) {
        // Pas de nouvelles photos, mais garder l'état actuel si il y en avait
        console.log(`[NewPhotosNotification] Aucune nouvelle photo (${currentCount} = ${lastKnownCount})`);
      } else if (currentCount < lastKnownCount) {
        // Cas où des photos ont été supprimées ou simulation
        console.log(`[NewPhotosNotification] Photos supprimées ou simulation: ${lastKnownCount} -> ${currentCount}`);
        saveCurrentCount(currentCount);
      }
      
    } catch (error) {
      console.error('[NewPhotosNotification] Error checking for new photos:', error);
    }
  }, [getLastKnownCount, saveCurrentCount]);

  // Marquer les nouvelles photos comme vues
  const markAsViewed = useCallback(() => {
    setHasNewPhotos(false);
    setNewPhotosCount(0);
    saveCurrentCount(totalPhotos);
    console.log('[NewPhotosNotification] Photos marquées comme vues - Badge masqué');
  }, [totalPhotos, saveCurrentCount]);

  // Force une vérification manuelle
  const forceCheck = useCallback(async () => {
    console.log('[NewPhotosNotification] Vérification forcée des nouvelles photos');
    await checkForNewPhotos();
  }, [checkForNewPhotos]);
  
  // Fonction de test pour simuler de nouvelles photos
  const simulateNewPhotos = useCallback((count: number = 1) => {
    const currentKnown = getLastKnownCount();
    const newKnown = Math.max(0, currentKnown - count); // Réduire le nombre connu pour simuler de nouvelles photos
    
    try {
      localStorage.setItem(STORAGE_KEY, newKnown.toString());
      console.log(`[NewPhotosNotification] 🧪 Test: Simulation de ${count} nouvelles photos (${currentKnown} -> ${newKnown})`);
      
      // Forcer une vérification après la simulation avec cleanup
      const timeoutId = setTimeout(() => {
        checkForNewPhotos();
      }, 500);
      
      // Retourner une fonction de cleanup pour permettre l'annulation si nécessaire
      return () => clearTimeout(timeoutId);
    } catch (error) {
      console.error('[NewPhotosNotification] Erreur simulation:', error);
      return () => {}; // Retourner une fonction vide en cas d'erreur
    }
  }, [getLastKnownCount, checkForNewPhotos]);
  
  // Réinitialiser le système de notification
  const resetNotification = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setHasNewPhotos(false);
      setNewPhotosCount(0);
      setTotalPhotos(0);
      console.log('[NewPhotosNotification] 🔄 Système réinitialisé');
    } catch (error) {
      console.error('[NewPhotosNotification] Erreur réinitialisation:', error);
    }
  }, []);

  // Vérification initiale et périodique
  useEffect(() => {
    // Vérification initiale avec initialisation si nécessaire
    const initializeAndCheck = async () => {
      const lastKnown = getLastKnownCount();
      if (lastKnown === 0) {
        // Premier chargement - afficher toujours 2 nouvelles photos pour inciter à découvrir
        try {
          const entries = await fetchCommunityEntries();
          setTotalPhotos(entries.length);
          setNewPhotosCount(2);
          setHasNewPhotos(true);
          console.log(`[NewPhotosNotification] Premier chargement: Affichage de 2 nouvelles photos pour inciter à découvrir`);
          // Ne pas sauvegarder le count pour maintenir l'état "nouvelles photos"
        } catch (error) {
          console.error('[NewPhotosNotification] Erreur initialisation:', error);
        }
      } else {
        // Vérification normale
        checkForNewPhotos();
      }
    };
    
    initializeAndCheck();
    
    // Vérification périodique
    const interval = setInterval(checkForNewPhotos, CHECK_INTERVAL);
    
    return () => {
      clearInterval(interval);
    };
  }, [checkForNewPhotos, getLastKnownCount, saveCurrentCount]);

  return {
    hasNewPhotos,
    newPhotosCount,
    totalPhotos,
    markAsViewed,
    forceCheck,
    simulateNewPhotos,
    resetNotification
  };
}

// Fonctions globales pour les tests dans la console
if (typeof window !== 'undefined') {
  // Stocker une référence globale pour les tests
  let globalNotificationHook: NewPhotosNotification | null = null;
  
  // Fonction pour enregistrer le hook
  (window as unknown as Record<string, unknown>).registerNotificationHook = (hook: NewPhotosNotification) => {
    globalNotificationHook = hook;
    if (import.meta.env.DEV) {
      console.log('📸 [NewPhotosNotification] Hook enregistré pour les tests');
    }
  };
  
  // Fonctions de test globales
  (window as unknown as Record<string, unknown>).testNewPhotos = (count: number = 1) => {
    if (globalNotificationHook) {
      globalNotificationHook.simulateNewPhotos(count);
    } else {
      console.warn('📸 Hook de notification non disponible. Naviguez vers une page avec galerie.');
    }
  };
  
  (window as unknown as Record<string, unknown>).resetPhotoNotifications = () => {
    if (globalNotificationHook) {
      globalNotificationHook.resetNotification();
    } else {
      console.warn('📸 Hook de notification non disponible. Naviguez vers une page avec galerie.');
    }
  };
  
  (window as unknown as Record<string, unknown>).checkPhotoNotifications = () => {
    if (globalNotificationHook) {
      globalNotificationHook.forceCheck();
    } else {
      console.warn('📸 Hook de notification non disponible. Naviguez vers une page avec galerie.');
    }
  };
  
  if (import.meta.env.DEV) {
    console.log('📸 [NewPhotosNotification] Fonctions de test disponibles:');
    console.log('- testNewPhotos(count) : Simuler de nouvelles photos');
    console.log('- resetPhotoNotifications() : Réinitialiser le système');
    console.log('- checkPhotoNotifications() : Forcer une vérification');
  }
}

