import { useCallback } from 'react';

interface UseSwipeNavigationProps<T> {
  items: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  /** @deprecated Le swipe tactile a été retiré, ce paramètre est ignoré. */
  threshold?: number;
  /** @deprecated Le swipe tactile a été retiré, ce paramètre est ignoré. */
  enabled?: boolean;
}

interface UseSwipeNavigationReturn {
  canGoNext: boolean;
  canGoPrevious: boolean;
  goNext: () => void;
  goPrevious: () => void;
  currentIndex: number;
  totalCount: number;
}

/**
 * Hook de navigation entre des items (fiche précédente / suivante).
 *
 * Le swipe tactile a été retiré : il se déclenchait trop facilement pendant
 * le défilement. La navigation passe désormais uniquement par les flèches
 * du SwipeIndicator et par le clavier.
 *
 * @template T - Type des items à parcourir
 * @param items - Liste des items à naviguer
 * @param currentIndex - Index actuel
 * @param onIndexChange - Callback appelé lors du changement d'index
 *
 * @example
 * ```tsx
 * const swipe = useSwipeNavigation({
 *   items: locations,
 *   currentIndex: selectedIndex,
 *   onIndexChange: setSelectedIndex
 * });
 * ```
 */
export const useSwipeNavigation = <T>({
  items,
  currentIndex,
  onIndexChange
}: UseSwipeNavigationProps<T>): UseSwipeNavigationReturn => {
  const canGoNext = currentIndex < items.length - 1;
  const canGoPrevious = currentIndex > 0;

  const goNext = useCallback(() => {
    if (canGoNext) {
      onIndexChange(currentIndex + 1);
    }
  }, [canGoNext, currentIndex, onIndexChange]);

  const goPrevious = useCallback(() => {
    if (canGoPrevious) {
      onIndexChange(currentIndex - 1);
    }
  }, [canGoPrevious, currentIndex, onIndexChange]);

  return {
    canGoNext,
    canGoPrevious,
    goNext,
    goPrevious,
    currentIndex,
    totalCount: items.length
  };
};
