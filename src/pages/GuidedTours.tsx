// Page publique: /reservations — Listing visites guidées + inscription
import { useEffect, useMemo, useState } from "react";
import { Tour } from "../types/visitTypes";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { TourRegistrationForm } from "@/components/TourRegistrationForm";
import { useTours } from "@/hooks/useTours";
import { groupToursByDayAndTime } from "@/utils/groupTours";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { SwipeIndicator } from "@/components/ui/SwipeIndicator";

const ORANGE = "#ff7a45";

export default function GuidedTours() {
  const { tours, isLoading: loading, error } = useTours();
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [tourSwipeIndex, setTourSwipeIndex] = useState<number>(0);

  // Toutes les visites triées chronologiquement pour la navigation - MÉMOÏSÉ
  const allToursSorted = useMemo(
    () => [...tours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [tours]
  );

  // Synchroniser l'index avec la visite sélectionnée
  useEffect(() => {
    if (selectedTour) {
      const index = allToursSorted.findIndex((t) => t.id === selectedTour.id);
      if (index !== -1) setTourSwipeIndex(index);
    }
  }, [selectedTour, allToursSorted]);

  return (
    <VisitLayout
      title="Visites Guidées"
      onBack={selectedTour ? () => setSelectedTour(null) : undefined}
      backTo="/map"
      share={{
        title: "Visites Guidées — Collectif Île Feydeau",
        text: "Découvrez l'Île Feydeau accompagné d'un guide du Collectif.",
      }}
    >
      {loading ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">Chargement...</CardContent>
        </Card>
      ) : error ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-red-600">Impossible de charger les visites. Vérifiez que l'API est disponible.</CardContent>
        </Card>
      ) : selectedTour ? (
        <TourDetail
          tour={selectedTour}
          navigableTours={allToursSorted}
          currentIndex={tourSwipeIndex}
          onIndexChange={(newIndex) => {
            const newTour = allToursSorted[newIndex];
            if (newTour) {
              setSelectedTour(newTour);
              setTourSwipeIndex(newIndex);
            }
          }}
        />
      ) : (
        <>
          <p className="text-center text-gray-600 mb-6">
            Découvrez l'Île Feydeau accompagné d'un guide du Collectif.
          </p>
          {tours.length === 0 ? (
            <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
              <CardContent className="p-6 text-gray-600 text-center">
                Aucune visite disponible pour le moment.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {groupToursByDayAndTime(tours).map((day) => (
                <div key={day.dayKey}>
                  <h2 className="text-xl font-bold text-[#1a2138] font-serif mb-4 capitalize">
                    {day.dayLabel}
                  </h2>
                  <div className="space-y-6">
                    {day.slots.map((slot) => (
                      <div key={slot.time}>
                        <h3 className="text-sm font-bold uppercase tracking-wide text-[#ff7a45] mb-2">
                          {slot.time}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {slot.tours.map((tour) => (
                            <TourCard key={tour.id} tour={tour} onClick={() => setSelectedTour(tour)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-10 text-xs text-gray-500 text-center">
            <a href="#/reservations/gdpr" className="hover:underline">
              Gérer / supprimer mes données (RGPD)
            </a>
          </p>
        </>
      )}
    </VisitLayout>
  );
}

function TourCard({ tour, onClick }: { tour: Tour; onClick: () => void }) {
  const placesLeft = tour.placesLeft ?? tour.capacity;
  const isFull = placesLeft <= 0;
  return (
    <Card
      onClick={onClick}
      className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={`font-bold text-lg ${isFull ? "text-gray-400 line-through" : "text-[#1a2138]"}`}>
            {tour.title}
          </h3>
          {isFull && (
            <span className="flex-shrink-0 text-xs font-bold uppercase px-2 py-1 rounded-full bg-gray-200 text-gray-600">
              Complet
            </span>
          )}
        </div>
        {tour.description && <p className="text-sm text-gray-600 mb-1 line-clamp-2">{tour.description}</p>}
        <p className="text-sm text-gray-600">Durée : {tour.durationMinutes} min</p>
        <p className={`text-sm ${isFull ? "font-semibold text-red-600" : "text-gray-600"}`}>
          Places : {placesLeft}/{tour.capacity}
        </p>
        {(tour.labels?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 my-3">
            {(tour.labels || []).map((label) => (
              <span key={label} className="text-xs bg-[#f1ede2] text-[#5b5340] px-2.5 py-1 rounded-full">
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end mt-3">
          <span className="text-sm font-bold" style={{ color: isFull ? "#b45309" : ORANGE }}>
            {isFull ? "Liste d'attente ›" : "S'inscrire ›"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TourDetail({
  tour,
  navigableTours = [],
  currentIndex = 0,
  onIndexChange,
}: {
  tour: Tour;
  navigableTours?: Tour[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}) {
  const placesLeft = tour.placesLeft ?? tour.capacity;
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

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
    enabled: navigableTours.length > 1,
  });

  return (
    <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg" {...swipe.handlers}>
      <CardContent className="p-6">
        {navigableTours.length > 1 && (
          <div className="flex justify-center mb-3">
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
        <h2 className="text-2xl font-bold text-[#1a2138] mb-1">{tour.title}</h2>
        <p className="text-gray-600 mb-2 capitalize">
          {dateStr} à {timeStr} • Durée : {tour.durationMinutes} min
        </p>
        {tour.description && <p className="text-gray-700 mb-4 whitespace-pre-wrap">{tour.description}</p>}

        <div className="mb-3 p-3 rounded-lg bg-[#fbf7ec] border border-amber-200 font-semibold text-[#1a2138]">
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
      </CardContent>
    </Card>
  );
}
