import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/BackButton";
import { analytics, EventAction } from "@/services/firebaseAnalytics";
import "@/styles/decorations.css"; // Import des décorations
import { type Event } from "@/data/events";
import { useEvents } from "@/hooks/useData";
import { ProgramFilters } from "@/components/ProgramFilters";
import { ALL_DAYS, ALL_TYPES, daySections, toggleDay, type Day } from "@/utils/programFilters";
import { ShareButton } from "@/components/ShareButton";
import { BottomNavigation } from "@/components/BottomNavigation";
import { EventDetailsNew as EventDetails } from "@/components/EventDetailsModern";
import { EventCardModern } from "@/components/EventCardModern";
import { getSavedEvents, saveEvent, removeSavedEvent } from "../services/savedEvents";
import { IMAGE_PATHS } from "../constants/imagePaths";
import { getImagePath } from "@/utils/imagePaths";
import { toast } from "@/components/ui/use-toast";
import { type Tour } from "@/types/visitTypes";
import { useTours } from "@/hooks/useTours";
import { TourDetailsModal } from "@/components/TourDetailsModal";
import { TourCardModern } from "@/components/TourCardModern";
import { groupToursByDayAndTime } from "@/utils/groupTours";

const DAY_INDEX: Record<Day, number> = { samedi: 6, dimanche: 0 };
const toursByDay = (tours: Tour[], day: Day) =>
  tours.filter((t) => new Date(t.date).getDay() === DAY_INDEX[day]);

const Program = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { events: allRemoteEvents, isLoading: eventsLoading } = useEvents();
  const getEventsByDay = (day: Day) =>
    allRemoteEvents.filter(e => e.days.includes(day));
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  // Jour : les deux cochés par défaut, on peut en décocher un (jamais les deux).
  const [selectedDays, setSelectedDays] = useState<Day[]>(ALL_DAYS);
  // Type : « Tout » par défaut, sinon une seule catégorie.
  const [currentFilter, setCurrentFilter] = useState<string>(ALL_TYPES);
  // Le header est fixe : on mesure sa hauteur réelle pour décaler la liste,
  // plutôt qu'une valeur codée en dur qui cachait la première carte.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [eventSwipeIndex, setEventSwipeIndex] = useState<number>(0);
  const [tourSwipeIndex, setTourSwipeIndex] = useState<number>(0);
  const { tours, isLoading: toursLoading } = useTours();

  useEffect(() => {
    analytics.trackPageView('/program', 'Programme');
    const saved = getSavedEvents();
    setSavedEventIds(saved.map(e => e.id));
  }, []);

  // Effet séparé pour gérer l'ouverture d'événement depuis l'URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventId = params.get('event');
    if (!eventId) return;

    // Le programme est chargé dynamiquement : attendre les données avant de résoudre le lien
    if (eventsLoading) {
      return;
    }

    const event = allRemoteEvents.find(e => e.id === eventId);
    if (event) {
      // Petit délai pour s'assurer que le composant est monté
      setTimeout(() => {
        setSelectedEvent(event);
      }, 100);
    } else {
      toast({
        title: "Événement introuvable",
        description: "Cet événement n'est plus au programme ou le lien est invalide.",
        variant: "destructive"
      });
    }
    // Nettoyer le paramètre de l'URL
    navigate('/program', { replace: true });
  }, [location.search, navigate, allRemoteEvents, eventsLoading]);

  const handleSaveEvent = (event: Event, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlySaved = savedEventIds.includes(event.id);
    if (isCurrentlySaved) {
      removeSavedEvent(event.id);
      setSavedEventIds(savedEventIds.filter(id => id !== event.id));
      analytics.trackContentInteraction(EventAction.UNSAVE, 'event', event.id, { event_title: event.title, source: 'program' });
    } else {
      saveEvent(event);
      setSavedEventIds([...savedEventIds, event.id]);
      analytics.trackContentInteraction(EventAction.SAVE, 'event', event.id, { event_title: event.title, source: 'program' });
    }
  };

  const handleFilterChange = (filter: string) => {
    setCurrentFilter(filter);
    analytics.trackProgramInteraction(EventAction.FILTER, { filter });
  };

  const handleToggleDay = (day: Day) => {
    const next = toggleDay(selectedDays, day);
    if (next === selectedDays) return;
    setSelectedDays(next);
    analytics.trackProgramInteraction(EventAction.FILTER, { days: next.join(",") });
  };

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Catégorie d'affichage d'un event : "Type d'événement" (Sheet) sinon label du type technique.
  const catOf = (e: Event) => e.category || (e.type === 'exposition' ? 'Exposition' : 'Concert');

  // Onglets dynamiques : une catégorie par valeur présente. Expositions/Concerts en tête, puis Visites guidées.
  const categories = useMemo(() => {
    const set = new Set(allRemoteEvents.map(catOf));
    // Afficher l'onglet dès le chargement (pas d'attente du fetch) pour éviter
    // qu'il n'apparaisse en retard ; il disparaît si le fetch confirme 0 visite.
    if (tours.length > 0 || toursLoading) set.add('Visites guidées');
    const order = (c: string) => {
      if (c === 'Exposition' || c === 'Expositions') return 0;
      if (c === 'Concert' || c === 'Concerts') return 1;
      if (c === 'Visites guidées') return 2;
      return 3;
    };
    return Array.from(set).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  }, [allRemoteEvents, tours, toursLoading]);

  // Si la catégorie choisie disparaît (données rechargées), on revient à « Tout ».
  useEffect(() => {
    if (currentFilter !== ALL_TYPES && categories.length && !categories.includes(currentFilter)) {
      setCurrentFilter(ALL_TYPES);
    }
  }, [categories, currentFilter]);

  const filterEvents = (events: Event[], filter: string) => {
    if (!filter || filter === ALL_TYPES) return events;
    return events.filter(event => catOf(event) === filter);
  };
  
  const startMinutes = (timeRange: string): number => {
    const match = timeRange.match(/(\d{1,2})h(\d{2})/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return h * 60 + m;
  };

  const sortByStartTime = (items: Event[]): Event[] => {
    return [...items].sort((a, b) => startMinutes(a.time) - startMinutes(b.time));
  };
  
  // Événements visibles (jours cochés + type), dans l'ordre d'affichage, pour la
  // navigation par balayage dans la fiche. Un événement présent les deux jours
  // n'apparaît qu'une fois.
  const filteredEventsSorted = useMemo(() => {
    const seen = new Set<string>();
    const out: Event[] = [];
    for (const { day } of daySections(selectedDays)) {
      for (const e of sortByStartTime(filterEvents(getEventsByDay(day), currentFilter))) {
        if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
      }
    }
    return out;
  }, [allRemoteEvents, selectedDays, currentFilter]);
  
  // Synchroniser l'index avec l'événement sélectionné
  useEffect(() => {
    if (selectedEvent) {
      const index = filteredEventsSorted.findIndex(e => e.id === selectedEvent.id);
      if (index !== -1) {
        setEventSwipeIndex(index);
      }
    }
  }, [selectedEvent, filteredEventsSorted]);

  // Toutes les visites triées chronologiquement pour la navigation - MÉMOÏSÉ
  const allToursSorted = useMemo(
    () => [...tours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [tours]
  );

  // Synchroniser l'index avec la visite sélectionnée
  useEffect(() => {
    if (selectedTour) {
      const index = allToursSorted.findIndex(t => t.id === selectedTour.id);
      if (index !== -1) {
        setTourSwipeIndex(index);
      }
    }
  }, [selectedTour, allToursSorted]);
  
  return (
    <div className="min-h-screen pb-20 relative" style={{
      backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.TEXTURED_CREAM}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'scroll'
    }}>
      {/* Touches de pinceau décoratives (discrètes, sous le contenu) */}
      <div className="brush-stroke-left"></div>
      <div className="brush-stroke-left-2"></div>

      {/* Header fixe en haut : titre + une ligne de deux filtres */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200/50" style={{
        backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.TEXTURED_CREAM}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <div className="container mx-auto px-4 pt-4 pb-3 max-w-4xl">
          <header className="mb-3 flex items-center justify-between">
            <BackButton to="/map" />
            <h1 className="text-2xl font-bold text-[#1a2138]">Programme</h1>
            <ShareButton
              title="Programme - Collectif Île Feydeau"
              text="Découvrez le programme des événements du Collectif Île Feydeau"
              url={typeof window !== 'undefined' ? window.location.href : ''}
            />
          </header>
          <ProgramFilters
            selectedDays={selectedDays}
            onToggleDay={handleToggleDay}
            categories={categories}
            currentFilter={currentFilter}
            onFilterChange={handleFilterChange}
          />
        </div>
      </div>

      {/* Contenu décalé de la hauteur mesurée du header */}
      <div className="container mx-auto px-4 max-w-4xl relative z-10" style={{ paddingTop: headerHeight + 16 }}>
        {daySections(selectedDays).map(({ day, title }) => {
          const showEvents = currentFilter !== 'Visites guidées';
          const showTours = currentFilter === ALL_TYPES || currentFilter === 'Visites guidées';
          const dayEvents = showEvents ? sortByStartTime(filterEvents(getEventsByDay(day), currentFilter)) : [];
          const dayTours = showTours ? toursByDay(tours, day) : [];
          return (
            <section key={day} className="mb-6">
              {title && (
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-[15px] font-bold text-[#1a2138]">{title}</h2>
                  <div className="flex-1 h-px bg-[#1a2138]/20" />
                </div>
              )}
              <div className="space-y-4">
                {dayEvents.map((event, index) => (
                  <EventCardModern
                    key={event.id}
                    event={event}
                    isSaved={savedEventIds.includes(event.id)}
                    cardIndex={index}
                    onEventClick={() => setSelectedEvent(event)}
                    onSaveClick={(e) => handleSaveEvent(event, e)}
                  />
                ))}
              </div>
              {showTours && (
                currentFilter === 'Visites guidées' && toursLoading && dayTours.length === 0 ? (
                  <p className="text-gray-600 py-4 text-center text-sm">Chargement…</p>
                ) : (currentFilter === 'Visites guidées' || dayTours.length > 0) && (
                  <div className={dayEvents.length > 0 ? "mt-4" : ""}>
                    <TourSlotsList tours={dayTours} onTourClick={setSelectedTour} />
                  </div>
                )
              )}
              {showEvents && !showTours && dayEvents.length === 0 && !eventsLoading && (
                <p className="text-gray-600 py-4 text-center text-sm">Aucun événement ce jour-là</p>
              )}
            </section>
          );
        })}
      </div>

      <EventDetails 
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        source="program"
        navigableEvents={filteredEventsSorted}
        currentIndex={eventSwipeIndex}
        onIndexChange={(newIndex) => {
          const newEvent = filteredEventsSorted[newIndex];
          if (newEvent) {
            setSelectedEvent(newEvent);
            setEventSwipeIndex(newIndex);
            analytics.trackFeatureUse('swipe_navigation', {
              direction: newIndex > eventSwipeIndex ? 'next' : 'previous',
              from_event: selectedEvent?.id,
              to_event: newEvent.id,
              page: 'program'
            });
          }
        }}
      />

      <TourDetailsModal
        tour={selectedTour}
        isOpen={!!selectedTour}
        onClose={() => setSelectedTour(null)}
        navigableTours={allToursSorted}
        currentIndex={tourSwipeIndex}
        onIndexChange={(newIndex) => {
          const newTour = allToursSorted[newIndex];
          if (newTour) {
            setSelectedTour(newTour);
            setTourSwipeIndex(newIndex);
            analytics.trackFeatureUse('swipe_navigation', {
              direction: newIndex > tourSwipeIndex ? 'next' : 'previous',
              from_tour: selectedTour?.id,
              to_tour: newTour.id,
              page: 'program'
            });
          }
        }}
      />

      <BottomNavigation />
    </div>
  );
};

// Regroupe les visites d'une journée par créneau horaire — évite d'afficher
// une longue liste plate de cartes identiques quand plusieurs visites
// partagent le même horaire.
function TourSlotsList({ tours, onTourClick }: { tours: Tour[]; onTourClick: (tour: Tour) => void }) {
  const groups = groupToursByDayAndTime(tours);
  if (groups.length === 0) {
    return <p className="text-gray-600 py-4 text-center text-sm">Aucune visite guidée disponible</p>;
  }
  return (
    <>
      {groups.flatMap((day) => day.slots).map((slot) => (
        <div key={slot.time} className="mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#ff7a45] mb-2">
            {slot.time}
          </h3>
          <div className="space-y-4">
            {slot.tours.map((tour, index) => (
              <TourCardModern key={tour.id} tour={tour} cardIndex={index} onTourClick={() => onTourClick(tour)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default Program;

