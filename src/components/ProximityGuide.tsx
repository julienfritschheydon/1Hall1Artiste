import React, { useEffect, useState } from 'react';
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Location } from "@/data/locations";
import { GeoPosition } from "./UserLocation";
import {
  computeNearbyLocations,
  AT_LOCATION_THRESHOLD,
  type LocationWithDistance,
} from "@/utils/proximity";
import Navigation from "lucide-react/dist/esm/icons/navigation";
import MapPin from "lucide-react/dist/esm/icons/map-pin";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";

// Créer un logger pour le composant
const logger = createLogger('ProximityGuide');

export type ProximityGuideProps = {
  userPosition: GeoPosition | null;
  locations: Location[];
  onSelectLocation: (locationId: string) => void;
  visitedLocations: Set<string>;
};

/**
 * Composant qui guide l'utilisateur vers les points d'intérêt à proximité
 */
const ProximityGuide: React.FC<ProximityGuideProps> = ({
  userPosition,
  locations,
  onSelectLocation,
  visitedLocations
}) => {
  const [nearbyLocations, setNearbyLocations] = useState<LocationWithDistance[]>([]);
  const [expanded, setExpanded] = useState(false);
  
  // Calculer les lieux à proximité lorsque la position de l'utilisateur change
  useEffect(() => {
    if (!userPosition) return;

    const nearby = computeNearbyLocations(userPosition, locations);
    setNearbyLocations(nearby);

    logger.info('Lieux à proximité calculés', {
      userPosition,
      nearbyCount: nearby.length,
      evaluated: locations.length,
    });
  }, [userPosition, locations]);
  
  if (!userPosition || nearbyLocations.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 px-4 mb-2">
      <div className="bg-white rounded-lg shadow-lg border border-[#d8e3ff] overflow-hidden">
        <div 
          className="p-3 bg-[#f0f5ff] flex justify-between items-center cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center">
            <Navigation className="h-4 w-4 mr-2 text-[#4a5d94]" />
            <span className="font-medium text-[#1a2138]">
              {expanded
                ? "Lieux à proximité"
                : `${nearbyLocations.length} lieu${nearbyLocations.length > 1 ? "x" : ""} à proximité`}
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <span className="text-[#4a5d94]">
              {expanded ? "−" : "+"}
            </span>
          </Button>
        </div>
        
        {expanded && (
          <div className="p-3 max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {nearbyLocations.map((location) => {
                const isNearby = location.distance < AT_LOCATION_THRESHOLD;
                const isVisited = visitedLocations.has(location.id);
                
                return (
                  <div 
                    key={location.id}
                    className={`p-2 rounded-md cursor-pointer transition-colors
                      ${isNearby 
                        ? 'bg-[#e6f7ff] hover:bg-[#d1efff]' 
                        : 'bg-[#f5f5f5] hover:bg-[#e9e9e9]'
                      }
                      ${isVisited ? 'border-l-4 border-[#4CAF50]' : ''}
                    `}
                    onClick={() => onSelectLocation(location.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center">
                          {isVisited && (
                            <CheckCircle className="h-3 w-3 mr-1 text-[#4CAF50]" />
                          )}
                          <span className="font-medium text-sm text-[#1a2138]">
                            {location.name}
                          </span>
                        </div>
                        <div className="flex items-center mt-1">
                          <MapPin className="h-3 w-3 mr-1 text-[#8c9db5]" />
                          <span className="text-xs text-[#8c9db5]">
                            {isNearby 
                              ? `Vous y êtes ! (${Math.round(location.distance)}m)`
                              : `${Math.round(location.distance)}m au ${location.direction}`
                            }
                          </span>
                        </div>
                      </div>
                      <Navigation 
                        className={`h-5 w-5 ${isNearby ? 'text-[#4CAF50]' : 'text-[#4a5d94]'}`} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProximityGuide;

