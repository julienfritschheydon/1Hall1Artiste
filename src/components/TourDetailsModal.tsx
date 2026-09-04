import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tour } from "@/types/visitTypes";
import { findLocationForTour } from "@/utils/tourLocation";
import { TourRegistrationForm } from "@/components/TourRegistrationForm";
import { buildShareUrl } from "@/utils/url";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { SwipeIndicator } from "@/components/ui/SwipeIndicator";
import X from "lucide-react/dist/esm/icons/x";
import Share2 from "lucide-react/dist/esm/icons/share-2";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import Clock from "lucide-react/dist/esm/icons/clock";

interface TourDetailsModalProps {
  tour: Tour | null;
  isOpen: boolean;
  onClose: () => void;
  navigableTours?: Tour[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}

export function TourDetailsModal({
  tour,
  isOpen,
  onClose,
  navigableTours = [],
  currentIndex = 0,
  onIndexChange,
}: TourDetailsModalProps) {
  const navigate = useNavigate();
  const [isSharing, setIsSharing] = useState(false);

  const swipe = useSwipeNavigation({
    items: navigableTours,
    currentIndex,
    onIndexChange: onIndexChange || (() => {}),
    threshold: 100,
    enabled: navigableTours.length > 1,
  });

  useKeyboardNavigation({
    onPrevious: swipe.goPrevious,
    onNext: swipe.goNext,
    onClose,
    enabled: navigableTours.length > 1 && isOpen,
  });

  if (!tour || !isOpen) return null;

  const placesLeft = tour.placesLeft ?? tour.capacity;
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl relative bg-amber-50/95 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
        {...swipe.handlers}
      >
        <div className="relative z-10 p-6">
          {navigableTours.length > 1 && (
            <div className="flex justify-center mb-2">
              <SwipeIndicator
                currentIndex={swipe.currentIndex}
                totalCount={swipe.totalCount}
                canGoPrevious={swipe.canGoPrevious}
                canGoNext={swipe.canGoNext}
                onPrevious={swipe.goPrevious}
                onNext={swipe.goNext}
                showArrows={true}
                showCounter={true}
              />
            </div>
          )}
          {/* Boutons en haut à droite — même chrome que la fiche événement */}
          <div className="flex justify-end items-center gap-2 mb-4">
            <button
              onClick={() => {
                onClose();
                const matchingLocation = findLocationForTour(tour);
                navigate(matchingLocation ? `/map?location=${matchingLocation.id}` : "/map");
              }}
              className="h-10 w-10 flex items-center justify-center rounded-full border-2 bg-white/70 border-gray-300 text-gray-600 hover:border-amber-500 hover:text-amber-500 transition-colors"
              title="Voir sur la carte"
            >
              <MapPin className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                if (isSharing) return;
                const shareUrl = buildShareUrl(`/program?tour=${tour.id}`);
                if (navigator.share) {
                  setIsSharing(true);
                  navigator
                    .share({
                      title: `${tour.title} - Île Feydeau`,
                      text: `Visite guidée "${tour.title}" sur l'Île Feydeau à Nantes`,
                      url: shareUrl,
                    })
                    .catch((err: unknown) => {
                      if ((err as Error)?.name !== "AbortError") console.error("Error sharing:", err);
                    })
                    .finally(() => setIsSharing(false));
                } else {
                  navigator.clipboard.writeText(shareUrl);
                }
              }}
              disabled={isSharing}
              className="h-10 w-10 flex items-center justify-center rounded-full border-2 bg-white/70 border-gray-300 text-gray-600 hover:border-amber-500 hover:text-amber-500 transition-colors disabled:opacity-50"
              title="Partager"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="h-10 w-10 flex items-center justify-center rounded-full border-2 bg-white/70 border-gray-300 text-gray-600 hover:border-amber-500 hover:text-amber-500 transition-colors"
              title="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 className="text-2xl font-bold text-[#1a2138] mb-1 font-lora">{tour.title}</h2>
          <p className="text-gray-600 mb-4 capitalize flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {dateStr} à {timeStr} · {tour.durationMinutes} min
          </p>

          <div className="mb-3 p-3 rounded-lg bg-white/80 border-2 border-amber-300 font-semibold text-[#1a2138] flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#ff7a45] flex-shrink-0" />
            Départ : {tour.startLocationName || "Lieu à préciser"}
          </div>

          {(tour.labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(tour.labels || []).map((label) => (
                <span key={label} className="text-xs bg-[#f1ede2] text-[#5b5340] px-2.5 py-1 rounded-full">
                  {label}
                </span>
              ))}
            </div>
          )}

          {placesLeft <= 0 ? (
            <div className="mb-6 p-3 rounded-lg bg-amber-100 border-2 border-amber-400 font-bold text-amber-900">
              Visite complète ({tour.capacity}/{tour.capacity}) — rejoignez la liste d'attente ci-dessous
            </div>
          ) : (
            <div className="mb-6 p-3 rounded-lg bg-[#fff6ef] border border-[#ffd9c4] font-bold text-[#e8693a]">
              Places restantes : {placesLeft}/{tour.capacity}
            </div>
          )}

          <TourRegistrationForm tour={tour} placesLeft={placesLeft} />
        </div>
      </div>
    </div>
  );
}
