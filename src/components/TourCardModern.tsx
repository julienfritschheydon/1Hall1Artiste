import { IMAGE_PATHS } from '../constants/imagePaths';
import React from 'react';
import { Card } from "@/components/ui/card";
import { Tour } from "@/types/visitTypes";
import Calendar from "lucide-react/dist/esm/icons/calendar";

export interface TourCardModernProps {
  tour: Tour;
  onTourClick: () => void;
  cardIndex?: number;
}

export const TourCardModern: React.FC<TourCardModernProps> = ({ tour, onTourClick, cardIndex }) => {
  const placesLeft = tour.placesLeft ?? tour.capacity;
  const timeStr = new Date(tour.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const getEventBackgroundPseudoElementStyle = (index?: number): React.CSSProperties => {
    const intensity = index !== undefined ? index % 4 : 0;
    const positions = ['top left', 'top right', 'bottom left', 'bottom right'];
    return {
      content: '""',
      position: 'absolute',
      top: 0, right: 0, bottom: 0, left: 0,
      backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
      backgroundSize: 'cover',
      backgroundPosition: positions[intensity],
      opacity: 0.6,
      zIndex: 1,
      transform: (intensity === 1 || intensity === 3) ? 'scaleX(-1)' : 'none',
    };
  };

  return (
    <Card
      className="card-modern cursor-pointer border-0 shadow-lg grid grid-cols-[96px_1fr] md:grid-cols-[128px_1fr]"
      style={{ position: 'relative', backgroundColor: 'transparent', overflow: 'hidden' }}
      onClick={onTourClick}
    >
      <div style={getEventBackgroundPseudoElementStyle(cardIndex)} />

      <div className="relative z-10 flex items-center justify-center bg-amber-100">
        <Calendar className="h-10 w-10 text-[#ff7a45]" />
      </div>

      <div className="relative z-10 flex-1 min-w-0 p-4 flex flex-col">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg leading-tight text-[#1a2138]">{tour.title}</h3>
          </div>
          <span className="text-xs font-semibold bg-orange-100 text-orange-800 px-2 py-1 rounded-full whitespace-nowrap ml-2 flex-shrink-0">
            {placesLeft} places
          </span>
        </div>

        <div className="flex-grow" />

        <div>
          <div className="text-gray-500 text-sm space-y-1">
            <p>{timeStr}</p>
            {tour.startLocationName && <p>{tour.startLocationName}</p>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span className="text-sm text-gray-600 font-medium">Visite guidée</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TourCardModern;
