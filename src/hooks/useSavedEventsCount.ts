import { useState, useEffect } from 'react';
import { getSavedEvents } from '@/services/savedEvents';
import { getSavedLocationIds } from '@/services/savedLocations';

export function useSavedEventsCount() {
  const [count, setCount] = useState(0);

  const updateCount = () => {
    setCount(getSavedEvents().length + getSavedLocationIds().length);
  };

  useEffect(() => {
    // Initialiser le compteur
    updateCount();

    // Écouter les changements dans le localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'savedEvents' || e.key === 'savedLocations') {
        updateCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Écouter les changements personnalisés (même onglet)
    const handleCustomEvent = () => {
      updateCount();
    };

    window.addEventListener('savedEventsChanged', handleCustomEvent);
    window.addEventListener('savedLocationsChanged', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('savedEventsChanged', handleCustomEvent);
      window.removeEventListener('savedLocationsChanged', handleCustomEvent);
    };
  }, []);

  return count;
}

