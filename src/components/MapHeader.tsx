import React from 'react';
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import Volume2 from "lucide-react/dist/esm/icons/volume-2";
import VolumeX from "lucide-react/dist/esm/icons/volume-x";

interface MapHeaderProps {
  visitedCount: number;
  totalCount: number;
  onLocationToggle?: () => void;
  onAmbianceToggle?: () => void;
  showLocationButton?: boolean;
  showAmbianceButton?: boolean;
  isLocationActive?: boolean;
  isAmbianceActive?: boolean;
}

export function MapHeader({
  visitedCount,
  totalCount,
  onLocationToggle,
  onAmbianceToggle,
  showLocationButton = true,
  showAmbianceButton = true,
  isLocationActive = false,
  isAmbianceActive = false
}: MapHeaderProps) {
  const toDiscoverCount = totalCount - visitedCount;

  // Style bouton icône rond, cohérent avec les autres pages (ShareButton / AudioGuideButton)
  const iconBtnClass = (active: boolean) =>
    [
      "flex items-center justify-center h-10 w-10 rounded-full border-2 bg-white/90 backdrop-blur-sm",
      "transition-all duration-200 hover:scale-105 hover:shadow-sm",
      active
        ? "border-amber-500 text-amber-500"
        : "border-gray-300 text-gray-600 hover:border-amber-500 hover:text-amber-500"
    ].join(" ");

  return (
    <div className="w-full mb-4 px-4">
      {/* Titre de la page */}
      <h1 className="text-2xl font-bold text-[#1a2138] text-center mb-4 font-serif">
        Carte
      </h1>
      
      {/* Compteur de progression - Style maquette */}
      <div className="flex justify-center mb-4">
        <div 
          className="flex items-center overflow-hidden shadow-lg"
          style={{
            borderRadius: '25px',
            border: '2px solid rgba(139, 69, 19, 0.3)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            minWidth: '240px'
          }}
        >
          {/* Section Visité (partie transparente) */}
          <div 
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold flex-1 justify-center"
            style={{
              // background: 'rgba(245, 244, 240, 0.3)',
              // color: '#1a2138',
              fontFamily: 'serif'
            }}
          >
            <span className="text-base font-bold">{visitedCount}</span>
            <span className="whitespace-nowrap">Visité{visitedCount > 1 ? 's' : ''}</span>
          </div>

          {/* Séparateur */}
          <div className="w-px h-8 bg-amber-700/30"></div>

          {/* Section À découvrir (partie semi-transparente) */}
          <div 
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-50 flex-1 justify-center"
            style={{
              background: 'rgba(139, 69, 19, 0.6)',
              fontFamily: 'serif'
            }}
          >
            <span className="text-base font-bold">{toDiscoverCount}</span>
            <span className="whitespace-nowrap">À découvrir</span>
          </div>
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="flex justify-center gap-3">
        {showLocationButton && (
          <button
            onClick={onLocationToggle}
            aria-pressed={isLocationActive}
            aria-label={isLocationActive ? 'Désactiver la localisation' : 'Activer la localisation'}
            title="Localisation"
            className={iconBtnClass(isLocationActive)}
          >
            <MapPin className="h-5 w-5" />
          </button>
        )}

        {showAmbianceButton && (
          <button
            onClick={onAmbianceToggle}
            aria-pressed={isAmbianceActive}
            aria-label={isAmbianceActive ? 'Désactiver le son d\'ambiance' : 'Activer le son d\'ambiance'}
            title="Ambiance"
            className={iconBtnClass(isAmbianceActive)}
          >
            {isAmbianceActive ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

