import { getImagePath } from '@/utils/imagePaths';
import { IMAGE_PATHS } from '../constants/imagePaths';
import React from 'react';
import { ActionButton } from "@/components/ui/ActionButton";
import { Card } from "@/components/ui/card";
import { Event } from "@/data/events";
import Heart from "lucide-react/dist/esm/icons/heart";
import Bookmark from "lucide-react/dist/esm/icons/bookmark";
import BookmarkCheck from "lucide-react/dist/esm/icons/bookmark-check";
import { EventImage } from "@/components/EventImage";
import { getBackgroundFallback } from "@/utils/backgroundUtils";
import { EVENT_STATUS_LABELS, type EventTimeStatus } from "@/utils/eventSchedule";

export interface EventCardModernProps {
  event: Event;
  isSaved: boolean;
  onEventClick: () => void;
  onSaveClick: (e: React.MouseEvent) => void;
  showImage?: boolean;
  priority?: boolean;
  cardIndex?: number;
  /** État temporel calculé par la page (cf. utils/eventSchedule). */
  timeStatus?: EventTimeStatus;
  /** « Samedi uniquement » / « Dimanche uniquement », le cas échéant. */
  absentDayLabel?: string | null;
}

export const EventCardModern: React.FC<EventCardModernProps> = ({ 
  event, 
  isSaved, 
  onEventClick, 
  onSaveClick,
  showImage = true,
  priority = false,
  cardIndex,
  timeStatus = "unknown",
  absentDayLabel = null,
}) => {
  // Les hooks doivent être appelés avant tout return conditionnel.
  const [isLiked, setIsLiked] = React.useState(false);

  if (!event || !event.id) return null;

  const handleActionClick = (e: React.MouseEvent, action: (e: React.MouseEvent) => void) => {
    e.stopPropagation();
    action(e);
  };

  const getEventBackgroundStyle = (): React.CSSProperties => ({
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  });

  const getEventBackgroundPseudoElementStyle = (index?: number): React.CSSProperties => {
    const intensity = index !== undefined ? index % 4 : 0;
    const positions = ['top left', 'top right', 'bottom left', 'bottom right'];
    let transform = 'none';
    if (intensity === 1 || intensity === 3) {
      transform = 'scaleX(-1)';
    }

    return {
      content: '""',
      position: 'absolute',
      top: 0, right: 0, bottom: 0, left: 0,
      backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
      backgroundSize: 'cover',
      backgroundPosition: positions[intensity],
      opacity: 0.6,
      zIndex: 1, 
      transform: transform,
    };
  };

  // Un créneau passé reste lisible et cliquable — la fiche de l'artiste garde
  // son intérêt une fois le concert fini — mais s'efface visuellement.
  const isPast = timeStatus === "past";
  const statusLabel =
    timeStatus === "ongoing" || timeStatus === "upcoming" || timeStatus === "past"
      ? EVENT_STATUS_LABELS[timeStatus]
      : null;
  const statusClass =
    timeStatus === "ongoing"
      ? "bg-green-100 text-green-700"
      : timeStatus === "upcoming"
      ? "bg-amber-100 text-amber-800"
      : "bg-gray-200 text-gray-600";

  return (
    <Card 
      className={`card-modern cursor-pointer border-0 shadow-lg grid grid-cols-[96px_1fr] md:grid-cols-[128px_1fr] ${
        isPast ? "opacity-60" : ""
      }`}
      style={getEventBackgroundStyle()}
      onClick={onEventClick}
    >
      <div style={getEventBackgroundPseudoElementStyle(cardIndex)} />
      
      {/* Colonne 1: Image */}
      {showImage && (
        <div className="relative z-10">
          <EventImage
            event={event}
            size="medium"
            priority={priority}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Colonne 2: Contenu */}
      <div className="relative z-10 flex-1 min-w-0 p-4 flex flex-col">
        {/* Section du haut : Titre et Boutons */}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h3 className='font-bold text-lg leading-tight text-[#1a2138]'>
              {event.artistName || event.title}
            </h3>
            {event.title && event.artistName && event.title !== event.artistName && (
              <p className="text-sm text-[#1a2138] mt-1 font-medium">
                {event.title}
              </p>
            )}
            {(statusLabel || absentDayLabel) && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {statusLabel && (
                  <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${statusClass}`}>
                    {statusLabel}
                  </span>
                )}
                {absentDayLabel && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f1ede2] text-[#5b5340]">
                    {absentDayLabel}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <ActionButton 
              variant="like" 
              active={isLiked}
              icon={<Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} />}
              onClick={(e) => handleActionClick(e, () => setIsLiked(!isLiked))}
              tooltip="J'aime cet événement"
            />
            <ActionButton 
              variant="save" 
              active={isSaved}
              icon={isSaved ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
              onClick={(e) => handleActionClick(e, onSaveClick)}
              tooltip={isSaved ? "Retirer des favoris" : "Ajouter aux favoris"}
            />
          </div>
        </div>

        {/* Espaceur qui pousse le contenu du bas vers le bas */}
        <div className="flex-grow"></div>

        {/* Section du bas : Infos et Badge */}
        <div>
          <div className="text-gray-500 text-sm space-y-1">
            <p>{event.time}</p>
            <p>{event.locationName}</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span className="text-sm text-gray-600 font-medium">
              {event.category || (event.type === 'exposition' ? 'Exposition' : 'Concert')}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default EventCardModern;


