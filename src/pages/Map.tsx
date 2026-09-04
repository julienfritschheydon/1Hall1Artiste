import { getImagePath } from '@/utils/imagePaths';
import { IMAGE_PATHS } from '../constants/imagePaths';
import { useState, useEffect, useRef, useMemo } from "react";
import UserLocation, { GeoPosition } from "@/components/UserLocation";
import ProximityGuide from "@/components/ProximityGuide";
import NavigationGuideSimple from "@/components/NavigationGuideSimple";
import LocationActivator from "@/components/LocationActivator";
import { useAmbianceAudio } from "@/hooks/useAmbianceAudio";
import { useNavigate, useLocation } from "react-router-dom";
import { createLogger } from "@/utils/logger";
import { MapComponent, MAP_WIDTH, MAP_HEIGHT } from "@/components/MapComponent";
import { ActionButton } from "@/components/ui/ActionButton";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsToggle } from "@/components/SettingsToggle";
import { analytics, EventAction } from "@/services/firebaseAnalytics";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import X from "lucide-react/dist/esm/icons/x";
import Info from "lucide-react/dist/esm/icons/info";
import Bookmark from "lucide-react/dist/esm/icons/bookmark";
import BookmarkCheck from "lucide-react/dist/esm/icons/bookmark-check";
import Navigation from "lucide-react/dist/esm/icons/navigation";
import { VisitProgress } from "@/components/VisitProgress";
import { ShareButton } from "@/components/ShareButton";
import { BottomNavigation } from "@/components/BottomNavigation";
import { EventDetailsNew as EventDetails } from "@/components/EventDetailsModern";
import { LocationDetailsModern } from "@/components/LocationDetailsModern";
import { type Event } from "@/data/events";
import { toast } from "@/components/ui/use-toast";
import { useData, useEvents, useLocations } from "@/hooks/useData";
import { saveEvent, removeSavedEvent, getSavedEvents } from "../services/savedEvents";
import { LikeButton } from "@/components/community/LikeButton";
import { unlockAchievement, AchievementType } from "../services/achievements";
import { AudioGuideButton } from "@/components/AudioGuideButton";
import { AudioGuidePlayer } from "@/components/AudioGuidePlayer";
import { MapHeader } from "@/components/MapHeader";
import { TourDetailsModal } from "@/components/TourDetailsModal";
import { type Tour } from "@/types/visitTypes";
import { useTours } from "@/hooks/useTours";
// Créer un logger pour le composant Map
const logger = createLogger('Map');

interface MapProps {
  fullScreen?: boolean;
}


const Map = ({ fullScreen = false }: MapProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Utiliser les hooks pour accéder aux données centralisées
  const { locations } = useLocations();
  const { events: allEvents, isLoading: eventsLoading, getEventById, getEventsByLocationId } = useEvents();

  // Déclarée avant navigableLocations (plus bas) qui l'utilise — sinon TDZ :
  // une location sans history ni audio (court-circuit du ||) forçait l'appel
  // avant l'initialisation de la const, crash silencieux du composant Map.
  const getLocationEvents = (locationId: string) => {
    const eventsWithThisLocation = getEventsByLocationId(locationId);
    logger.debug(`Événements trouvés pour ${locationId} via getEventsByLocationId`, eventsWithThisLocation);
    return eventsWithThisLocation;
  };

  // Utiliser directement les emplacements du service de données
  const [mapLocations, setMapLocations] = useState(locations);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [tourSwipeIndex, setTourSwipeIndex] = useState<number>(0);
  const { tours: allTours } = useTours();

  // Toutes les visites triées chronologiquement pour la navigation - MÉMOÏSÉ
  const allToursSorted = useMemo(
    () => [...allTours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [allTours]
  );

  // Synchroniser l'index avec la visite sélectionnée
  useEffect(() => {
    if (selectedTour) {
      const index = allToursSorted.findIndex((t) => t.id === selectedTour.id);
      if (index !== -1) setTourSwipeIndex(index);
    }
  }, [selectedTour, allToursSorted]);
  // Bâtiments hébergeant une visite : liste tenue à la main (ids réels de
  // data/locations.ts, coordonnées déjà justes) — pas de matching contre
  // visit_locations (RTDB), dataset séparé dont les coordonnées ne coïncident
  // pas forcément avec la carte. Ajouter/retirer un id ici quand une visite
  // existe réellement.
  const locationsWithTours: string[] = [
    "allee-duguay-trouin-17",
  ];
  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [activeLocation, setActiveLocation] = useState<string | null>(null);
  const [highlightedLocation, setHighlightedLocation] = useState<string | null>(null);

  // États pour la navigation par swipe entre lieux
  const [locationSwipeIndex, setLocationSwipeIndex] = useState<number>(0);
  
  // État pour la position de l'utilisateur sur la carte et GPS
  const [userPosition, setUserPosition] = useState<{ x: number, y: number } | null>(null);
  const [userGpsPosition, setUserGpsPosition] = useState<GeoPosition | null>(null);
  const [mapScale, setMapScale] = useState<number>(1); // Stocker le facteur d'échelle de la carte
  
  // État pour la navigation
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showLocationFeatures, setShowLocationFeatures] = useState(false);
  const [locationPermissionRequested, setLocationPermissionRequested] = useState(false);
  
  // Détection de l'environnement de développement désactivée pour les tests sur le terrain
  const isDevelopmentEnvironment = useMemo(() => {
    // Force à false pour les tests sur le terrain
    return false;
  }, []);
  
  // Lieux navigables (avec historique, audio ou événements)
  const navigableLocations = useMemo(() => 
    mapLocations.filter(loc => 
      loc.id && (loc.history || loc.audio || getLocationEvents(loc.id).length > 0)
    ),
    [mapLocations]
  );
  
  // Événements navigables dans la vue détail : ceux du lieu ouvert, sinon tous.
  // Triés par heure de début pour un ordre de navigation cohérent.
  const eventStartMinutes = (timeRange?: string): number => {
    const match = timeRange?.match(/(\d{1,2})h(\d{2})/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const navigableEvents = useMemo(() => {
    const base = activeLocation ? getLocationEvents(activeLocation) : allEvents;
    return [...base].sort((a, b) => eventStartMinutes(a.time) - eventStartMinutes(b.time));
  }, [activeLocation, allEvents]);

  const [eventSwipeIndex, setEventSwipeIndex] = useState<number>(0);

  // Synchroniser l'index avec l'événement sélectionné
  useEffect(() => {
    if (selectedEvent) {
      const index = navigableEvents.findIndex(e => e.id === selectedEvent.id);
      if (index !== -1) setEventSwipeIndex(index);
    }
  }, [selectedEvent, navigableEvents]);

  // Synchroniser l'index avec le lieu actif
  useEffect(() => {
    if (activeLocation) {
      const index = navigableLocations.findIndex(loc => loc.id === activeLocation);
      if (index !== -1) {
        setLocationSwipeIndex(index);
      }
    }
  }, [activeLocation, navigableLocations]);

  // Tracker les changements de zoom de la carte
  useEffect(() => {
    analytics.trackInteraction(EventAction.ZOOM, 'map', { scale: mapScale });
  }, [mapScale]);
  
  // Initialiser les données des lieux en incluant l'état de visite
  useEffect(() => {
    // Page view + map load
    analytics.trackPageView('/map', 'Carte');
    analytics.trackMapInteraction(EventAction.MAP_LOAD, {
      total_locations: locations.length
    });

    // Essayer de charger les lieux avec leur état de visite depuis le localStorage
    const savedLocations = localStorage.getItem("mapLocations");
    if (savedLocations) {
      try {
        const parsedLocations = JSON.parse(savedLocations);
        // Fusionner les données sauvegardées avec les données actuelles
        const mergedLocations = locations.map(loc => {
          const savedLoc = parsedLocations.find((saved: { id: string; visited?: boolean }) => saved.id === loc.id);
          return savedLoc ? { ...loc, visited: savedLoc.visited } : loc;
        });
        setMapLocations(mergedLocations);
      } catch (error) {
        logger.error('Erreur lors du chargement des lieux visités', { error });
      }
    }
  }, [locations]);
  
  // Charger les événements sauvegardés depuis le service
  useEffect(() => {
    const savedEventsData = getSavedEvents();
    const savedIds = savedEventsData.map(event => event.id);
    setSavedEventIds(savedIds);
  }, [isDevelopmentEnvironment]);
  
  // Recharger les événements sauvegardés lorsqu'on ferme la vue détaillée d'un événement
  useEffect(() => {
    if (!selectedEvent) {
      // Quand on ferme la vue détaillée, on recharge les événements sauvegardés
      const savedEventsData = getSavedEvents();
      const savedIds = savedEventsData.map(event => event.id);
      setSavedEventIds(savedIds);
    }
  }, [selectedEvent]);

  // Mettre à jour les emplacements lorsque les données changent
  useEffect(() => {
    logger.info('Mise à jour des emplacements sur la carte depuis le service de données');
    setMapLocations(locations);
  }, [locations]);
  
  // Fonction pour sauvegarder/retirer un événement des favoris
  const handleSaveEvent = (event: Event, e: React.MouseEvent) => {
    e.stopPropagation();
    logger.info(`Tentative de sauvegarde de l'événement: ${event.id} depuis la carte`);
    
    const isEventSaved = savedEventIds.includes(event.id);
    
    if (!isEventSaved) {
      // Ajouter l'événement aux favoris en utilisant le service
      saveEvent(event);
      // Mettre à jour l'état local
      setSavedEventIds([...savedEventIds, event.id]);
      // Analytics: sauvegarde
      analytics.trackContentInteraction(EventAction.SAVE, 'event', event.id, { source: 'map' });
      
      // toast({
      //   title: "Événement sauvegardé",
      //   description: `${event.title} a été ajouté à vos favoris.`,
      // });
      
      logger.info(`Événement ${event.id} sauvegardé avec succès depuis la carte`);
    } else {
      // Retirer l'événement des favoris en utilisant le service
      removeSavedEvent(event.id);
      // Mettre à jour l'état local
      setSavedEventIds(savedEventIds.filter(id => id !== event.id));
      // Analytics: désactivation de la sauvegarde
      analytics.trackContentInteraction(EventAction.UNSAVE, 'event', event.id, { source: 'map' });
      
      // toast({
      //   title: "Événement retiré",
      //   description: `${event.title} a été retiré de vos favoris.`,
      // });
      
      logger.info(`Événement ${event.id} retiré avec succès depuis la carte`);
    }
  };
  
  // Effet pour mettre en évidence le lieu lorsqu'on arrive depuis l'histoire complète ou l'admin
  useEffect(() => {
    // Vérifier si on a un ID de lieu à mettre en évidence dans l'état de location
    const highlightId = location.state?.highlightLocationId;
    const fromEvent = location.state?.fromEvent === true;
    const fromHistory = location.state?.fromHistory === true;
    
    // Vérifier si on a un ID de lieu à mettre en évidence dans les paramètres d'URL
    // HashRouter : les paramètres sont dans le hash (location.search du router),
    // mais on garde window.location.search en secours pour les anciens liens
    const searchParams = new URLSearchParams(location.search || window.location.search);
    const highlightParam = searchParams.get('highlight');
    const locationParam = searchParams.get('location');
    const eventParam = searchParams.get('event');
    
    // Utiliser l'ID du paramètre d'URL ou de l'état de location
    const locationIdToHighlight = highlightParam || locationParam || highlightId || eventParam;
    
    // Si aucun lieu à mettre en évidence, ne rien faire
    if (!locationIdToHighlight) {
      return;
    }
    
    logger.info(`Mise en évidence du lieu avec ID: ${locationIdToHighlight}`);

    // Le programme est chargé dynamiquement : attendre les données avant de résoudre un lien partagé
    if (eventParam && eventsLoading) {
      return;
    }

    // Convertir l'ID d'événement en ID de lieu si nécessaire
    let locationIdToUse = locationIdToHighlight;

    // Si c'est un ID d'événement, le convertir en ID de lieu
    if (eventParam && locationIdToHighlight === eventParam) {
      const event = allEvents.find(e => e.id === eventParam);
      if (event) {
        locationIdToUse = event.locationId;
        logger.debug(`Conversion de l'ID d'événement ${eventParam} en ID de lieu ${locationIdToUse}`);

        // Ouvrir automatiquement les détails de l'événement
        setTimeout(() => {
          setSelectedEvent(event);
          logger.info(`Ouverture automatique des détails de l'événement ${event.id}`);
        }, 500); // Petit délai pour permettre à la carte de se charger d'abord
      } else {
        logger.warn(`Événement ${eventParam} introuvable dans le programme chargé`);
        toast({
          title: "Événement introuvable",
          description: "Cet événement n'est plus au programme ou le lien est invalide.",
          variant: "destructive"
        });
        return;
      }
    }
    
    // Trouver l'emplacement correspondant
    let locationToHighlight = mapLocations.find(loc => loc.id === locationIdToUse);
    
    // Si le lieu n'est pas trouvé directement, essayer de trouver un lieu dont l'ID commence par locationIdToUse
    // Cela permet de gérer les cas où on passe un ID partiel comme "quai-turenne" au lieu de "quai-turenne-8"
    if (!locationToHighlight && locationIdToUse) {
      locationToHighlight = mapLocations.find(loc => loc.id.startsWith(locationIdToUse));
      if (locationToHighlight) {
        logger.info(`Lieu avec ID exact ${locationIdToUse} non trouvé, mais un lieu correspondant a été trouvé: ${locationToHighlight.id}`);
        locationIdToUse = locationToHighlight.id; // Mettre à jour l'ID avec celui qui a été trouvé
      }
    }
    
    if (locationToHighlight) {
      logger.debug('Lieu trouvé pour mise en évidence', { 
        id: locationToHighlight.id, 
        name: locationToHighlight.name,
        x: locationToHighlight.x,
        y: locationToHighlight.y
      });
      
      // Mettre en évidence le lieu (maintenant sans limite de temps)
      // La mise en évidence restera active jusqu'à ce que l'utilisateur interagisse avec la carte
      setHighlightedLocation(locationIdToUse);
      
      // N'ouvrir la programmation que si nous ne venons pas de l'historique ou des détails d'événement
      if (!fromHistory && !fromEvent) {
        setActiveLocation(locationIdToUse);
      }
      
      logger.debug(`Mise en évidence permanente du lieu ${locationIdToUse} jusqu'à la prochaine action utilisateur`);
    } else {
      logger.warn(`Lieu avec ID ${locationIdToHighlight} non trouvé dans mapLocations`);
      if (locationParam || highlightParam) {
        toast({
          title: "Lieu introuvable",
          description: "Ce lieu n'existe plus ou le lien est invalide.",
          variant: "destructive"
        });
      }
    }
  }, [location, mapLocations, allEvents, eventsLoading]);
  
  const handleLocationClick = (locationId: string) => {
    logger.info(`Clic sur l'emplacement ${locationId}`);
    
    // Stocker l'ID du lieu actif pour la mise en évidence
    setHighlightedLocation(locationId);
    
    // Définir le lieu comme actif pour afficher ses détails
    setActiveLocation(locationId);
    
    // Trouver les événements associés à ce lieu en utilisant la propriété locationId des événements
    const eventsData = getEventsByLocationId(locationId);
    logger.debug(`Récupération des événements pour le lieu ${locationId} via getEventsByLocationId`, eventsData);
    logger.debug(`Événements trouvés pour ${locationId}`, eventsData);
    // Analytics: vue de lieu depuis la carte
    const loc = mapLocations.find(l => l.id === locationId);
    if (loc) {
      analytics.trackBuildingView(loc.id, loc.name);
    }
    analytics.trackMapInteraction(EventAction.LOCATION_VIEW, {
      building_id: locationId,
      from: 'map'
    });
    
    // Toujours afficher d'abord les informations du lieu, jamais directement l'événement
    setSelectedEvent(null);
  };

  const markLocationAsVisited = (locationId: string, visited: boolean) => {
    const updatedLocations = mapLocations.map(loc => 
      loc.id === locationId ? { ...loc, visited } : loc
    );
    
    setMapLocations(updatedLocations);
    localStorage.setItem('mapLocations', JSON.stringify(updatedLocations));
    // Analytics: marquage visité
    analytics.trackFeatureUse('location_mark_visited', { location_id: locationId, visited });
    
    // Conserver la mise en évidence du lieu même après l'avoir marqué comme visité
    // Cela permet à l'utilisateur de voir le lieu mis en évidence lorsqu'il revient à la carte
    setHighlightedLocation(locationId);
    
    // toast({
    //   title: visited ? "Lieu marqué comme visité" : "Lieu marqué comme non visité",
    //   description: `${mapLocations.find(l => l.id === locationId)?.name} a été mis à jour.`,
    // });
    
    // Si le lieu est marqué comme visité, déclencher les achievements appropriés
    if (visited) {
      logger.info(`Lieu ${locationId} marqué comme visité, vérification des achievements`);
      
      // Vérifier si tous les lieux ont été visités
      const allVisited = updatedLocations.every(loc => loc.visited);
      if (allVisited) {
        logger.info('Tous les lieux ont été visités, déblocage de l\'achievement ALL_LOCATIONS_VISITED');
        unlockAchievement(AchievementType.ALL_LOCATIONS_VISITED);
      }
    }
  };


  // Calculate visited locations count
  const visitedCount = mapLocations.filter(loc => loc.visited).length;
  const totalCount = mapLocations.length;

  // Fonction pour réactiver la localisation si l'utilisateur a précédemment refusé
  const reactivateLocation = () => {
    localStorage.setItem('locationConsent', 'granted');
    setShowLocationFeatures(true);
    setLocationPermissionRequested(false); // Force la réinitialisation du processus de demande
    setPermissionDenied(false); // Réinitialiser l'état de permission refusée
  };

  // Activer / désactiver la localisation (bouton header)
  const toggleLocation = () => {
    if (!showLocationFeatures) {
      setPermissionDenied(false);
      setShowLocationFeatures(true);
      setLocationPermissionRequested(true);
      logger.info('Localisation activée manuellement par l\'utilisateur');
      analytics.trackMapInteraction(EventAction.USER_LOCATION, { granted: true });
    } else {
      setShowLocationFeatures(false);
      setNavigationTarget(null);
      logger.info('Localisation désactivée manuellement par l\'utilisateur');
      analytics.trackMapInteraction(EventAction.USER_LOCATION, { granted: false, disabled: true });
    }
  };

  // Son d'ambiance (bouton header)
  const { isActive: isAmbianceActive, toggle: toggleAmbiance } = useAmbianceAudio({
    onAudioEnabled: () => {
      analytics.trackFeatureUse('ambiance_toggle', { enabled: true });
      logger.info('Son d\'ambiance activé');
    },
    onAudioDisabled: () => {
      analytics.trackFeatureUse('ambiance_toggle', { enabled: false });
      logger.info('Son d\'ambiance désactivé');
    }
  });

  // Demander l'autorisation de localisation au chargement de la page
  useEffect(() => {
    // En environnement de développement, activer automatiquement la localisation sans demander
    if (isDevelopmentEnvironment) {
      setLocationPermissionRequested(true);
      setPermissionDenied(false);
      setShowLocationFeatures(true);
      localStorage.setItem('locationConsent', 'granted');
      logger.info('Environnement de développement détecté, localisation activée automatiquement');
      return;
    }
    
    // En production, réinitialiser les états pour forcer une nouvelle demande d'autorisation
    localStorage.removeItem('locationConsent');
    setLocationPermissionRequested(false);
    setPermissionDenied(false);
    setShowLocationFeatures(false);
  }, []);

  // Fonction pour mettre à jour la position de l'utilisateur
  const handleLocationUpdate = (x: number, y: number, gpsPosition?: GeoPosition) => {
    setUserPosition({ x, y });
    if (gpsPosition) {
      setUserGpsPosition(gpsPosition);
    }
    // Log seulement 0.1% des mises à jour pour réduire drastiquement le bruit dans la console
    // if (process.env.NODE_ENV === 'development' && Math.random() < 0.001) {
    //   logger.info('Position utilisateur mise à jour sur la carte', { x, y, gps: gpsPosition });
    // }
  };

  // Protection contre les erreurs DOM
  const [domError, setDomError] = useState<string | null>(null);
  
  useEffect(() => {
    const handleDOMError = (error: ErrorEvent) => {
      // Détecter les erreurs DOM critiques (insertBefore et removeChild)
      if (error.message && (error.message.includes('insertBefore') || error.message.includes('removeChild'))) {
        console.warn('[Map] DOM manipulation error caught:', error.message);
        setDomError('Erreur de rendu détectée, rechargement...');
        // Auto-recovery après 2 secondes
        setTimeout(() => {
          setDomError(null);
          // Force re-render en réinitialisant les états
          setActiveLocation(null);
          setSelectedEvent(null);
          setHighlightedLocation(null);
          // Forcer un re-render complet du composant carte
          setMapLocations([...mapLocations]);
        }, 2000);
      }
    };
    
    // Gérer aussi les erreurs non capturées par React
    const handleUnhandledError = (event: PromiseRejectionEvent) => {
      if (event.reason && typeof event.reason === 'string' && 
          (event.reason.includes('removeChild') || event.reason.includes('insertBefore'))) {
        console.warn('[Map] Unhandled DOM error caught:', event.reason);
        event.preventDefault(); // Empêcher le crash
        setDomError('Erreur de rendu détectée, rechargement...');
        setTimeout(() => {
          setDomError(null);
          setActiveLocation(null);
          setSelectedEvent(null);
          setHighlightedLocation(null);
        }, 2000);
      }
    };
    
    window.addEventListener('error', handleDOMError);
    window.addEventListener('unhandledrejection', handleUnhandledError);
    return () => {
      window.removeEventListener('error', handleDOMError);
      window.removeEventListener('unhandledrejection', handleUnhandledError);
    };
  }, [mapLocations]);
  
  if (domError) {
    return (
      <div className="min-h-screen pb-20 overflow-x-hidden flex items-center justify-center" style={{
        backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'scroll'
      }}>
        <div className="text-center p-4">
          <p className="text-red-500 mb-2">{domError}</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 overflow-x-hidden relative" style={{
      backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'scroll'
    }}>
      {/* Rose décorative en bas à droite */}
      <div 
        className="fixed bottom-14 right-0 pointer-events-none z-30"
        style={{
          width: '168px',
          height: '180px',
          backgroundImage: `url('${getImagePath('/images/Rose Transparent 66.png')}')`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'bottom right'
        }}
      />
      
      <div className="max-w-screen-lg mx-auto px-4 pt-2">
        {/* Header avec compteur style "carte au trésor" */}
        <MapHeader
          visitedCount={visitedCount}
          totalCount={totalCount}
          showLocationButton={true}
          showAmbianceButton={true}
          isLocationActive={showLocationFeatures}
          isAmbianceActive={isAmbianceActive}
          onLocationToggle={toggleLocation}
          onAmbianceToggle={toggleAmbiance}
          rightSlot={
            <ShareButton
              title="Parcours Île Feydeau"
              text="Découvrez mon parcours sur l'Île Feydeau à Nantes!"
            />
          }
        />
        

        
        
        <div className="relative">
          {/* Map container */}
          <div className="bg-transparent rounded-lg mb-4 border-0 transition-all duration-300 w-full">
            <div className="relative h-full">
              <MapComponent
                locations={mapLocations}
                locationsWithTours={locationsWithTours}
                activeLocation={activeLocation}
                highlightedLocation={highlightedLocation}
                onClick={(e) => {
                  // Récupérer l'ID du lieu depuis l'élément cliqué
                  const locationId = e.currentTarget.dataset.locationId || e.currentTarget.id.replace('location-', '');
                  if (locationId) {
                    handleLocationClick(locationId);
                  } else {
                    // Clic sur l'arrière-plan de la carte
                    analytics.trackInteraction(EventAction.CLICK, 'map_background');
                  }
                }}
                readOnly={false}
                onScaleChange={setMapScale}
                onPanStart={({ x, y }) => {
                  analytics.trackMapInteraction(EventAction.DRAG, {
                    phase: 'start',
                    x: Math.round(x),
                    y: Math.round(y)
                  });
                }}
                onPanEnd={({ totalDx, totalDy, distance, durationMs }) => {
                  analytics.trackMapInteraction(EventAction.DRAG, {
                    total_dx: Math.round(totalDx),
                    total_dy: Math.round(totalDy),
                    distance: Math.round(distance),
                    duration_ms: Math.round(durationMs)
                  });
                }}
                userLocationProps={showLocationFeatures ? {
                  onLocationUpdate: handleLocationUpdate,
                  showNavigation: false,
                  onPermissionChange: (denied) => setPermissionDenied(denied)
                } : undefined}
                navigationProps={navigationTarget && userPosition && userGpsPosition ? {
                  userPosition: userGpsPosition,
                  targetLocation: mapLocations.find(loc => loc.id === navigationTarget) || null,
                  onClose: () => setNavigationTarget(null)
                } : undefined}
              />
              
            
              {/* Message d'erreur et bouton pour réactiver la localisation - caché en mode développement */}
              {permissionDenied && !isDevelopmentEnvironment && (
                <div className="absolute top-0 left-0 right-0 z-50 bg-red-500 text-white p-2 text-center">
                  <div className="mb-2">Accès refusé - Vous avez refusé l'accès à votre position.</div>
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    onClick={reactivateLocation}
                    className="bg-white text-red-500 hover:bg-gray-100 text-xs"
                  >
                    Activer la localisation
                  </ActionButton>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Removed visit confirmation dialog */}

      {/* Location details overlay - Version modernisée */}
      {activeLocation && (
        <LocationDetailsModern
          location={mapLocations.find(l => l.id === activeLocation)!}
          events={getLocationEvents(activeLocation)}
          savedEventIds={savedEventIds}
          showLocationFeatures={showLocationFeatures}
          navigableLocations={navigableLocations}
          currentIndex={locationSwipeIndex}
          onIndexChange={(newIndex) => {
            const newLocation = navigableLocations[newIndex];
            if (newLocation) {
              setActiveLocation(newLocation.id);
              setLocationSwipeIndex(newIndex);
              analytics.trackFeatureUse('swipe_navigation', {
                direction: newIndex > locationSwipeIndex ? 'next' : 'previous',
                from_location: activeLocation,
                to_location: newLocation.id,
                page: 'map'
              });
            }
          }}
          onClose={() => {
            if (activeLocation) {
              analytics.trackInteraction(EventAction.BACK, 'location_details_close', { building_id: activeLocation });
            }
            setActiveLocation(null);
          }}
          onSaveEvent={handleSaveEvent}
          onSelectEvent={(event) => {
            analytics.trackProgramInteraction(EventAction.EVENT_DETAILS, { event_id: event.id, source: 'map' });
            setSelectedEvent(event);
          }}
          onSelectTour={(tour) => {
            analytics.trackInteraction(EventAction.CLICK, 'tour_details', { tour_id: tour.id, source: 'map' });
            setSelectedTour(tour);
          }}
          onMarkVisited={(visited) => {
            if (activeLocation) {
              markLocationAsVisited(activeLocation, visited);
            }
          }}
          onNavigate={() => {
            if (activeLocation) {
              setNavigationTarget(activeLocation);
              setActiveLocation(null);
              analytics.trackMapInteraction(EventAction.ROUTE_CALCULATE, {
                building_id: activeLocation,
                has_user_position: !!userPosition
              });
            }
          }}
          isVisited={mapLocations.find(l => l.id === activeLocation)?.visited || false}
        />
      )}
      
      {/* Event details using the unified component */}
      <EventDetails 
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => {
          setSelectedEvent(null);
          setHighlightedLocation(null); // Réinitialiser la mise en évidence
        }}
        source="map"
        navigableEvents={navigableEvents}
        currentIndex={eventSwipeIndex}
        onIndexChange={(newIndex) => {
          const newEvent = navigableEvents[newIndex];
          if (newEvent) {
            setSelectedEvent(newEvent);
            setEventSwipeIndex(newIndex);
            analytics.trackFeatureUse('swipe_navigation', {
              direction: newIndex > eventSwipeIndex ? 'next' : 'previous',
              from_event: selectedEvent?.id,
              to_event: newEvent.id,
              page: 'map'
            });
          }
        }}
      />
      
      {/* Boîte de dialogue de consentement de localisation retirée */}
      
      {/* Détails d'une visite guidée — inscription intégrée + navigation flèches */}
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
              page: 'map'
            });
          }
        }}
      />

      {/* Audio Guide Player Global */}
      <AudioGuidePlayer />
      
      {/* Bottom Navigation */}
      <BottomNavigation />
      
      {/* Guide de navigation (si un lieu est sélectionné pour la navigation) */}
      {/* Le NavigationGuide est maintenant intégré dans le MapComponent */}

    </div>
  );
};

export default Map;



