import { Event } from "@/data/events";
import { createLogger } from "@/utils/logger";
import { getFestivalDates } from "@/utils/festival";

// Créer un logger pour le service de calendrier
const logger = createLogger('calendarService');

/**
 * Types d'erreurs possibles lors de l'ajout au calendrier
 */
export enum CalendarErrorType {
  NOT_SUPPORTED = "NOT_SUPPORTED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  GENERAL_ERROR = "GENERAL_ERROR"
}

/**
 * Résultat de l'opération d'ajout au calendrier
 */
export interface CalendarResult {
  success: boolean;
  errorType?: CalendarErrorType;
  errorMessage?: string;
}

/**
 * Vérifie si l'API de calendrier est disponible sur l'appareil
 */
export const isCalendarSupported = (): boolean => {
  // Vérifier si nous sommes dans un navigateur mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Vérifier si l'API Web Share est disponible (indicateur indirect de support)
  const hasWebShare = 'share' in navigator && 'canShare' in navigator;
  
  // Sur iOS, nous pouvons utiliser des liens webcal://
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  // Sur desktop, nous pouvons toujours proposer le téléchargement du fichier .ics
  const isDesktop = !isMobile;
  
  logger.info("Vérification du support calendrier", { 
    isMobile, 
    hasWebShare, 
    isIOS, 
    isDesktop,
    userAgent: navigator.userAgent 
  });
  
  // Retourner true pour tous les appareils
  // - Sur mobile avec Web Share: utiliser l'API de partage
  // - Sur iOS: utiliser les liens webcal://
  // - Sur desktop: proposer le téléchargement du fichier .ics
  return hasWebShare || isIOS || isDesktop;
};

/**
 * Analyse un horaire saisi librement dans le Google Sheet.
 * Accepte « 14h30 », « 14h », « 14:30 », « 14 », et tolère du texte autour
 * (« 19h, samedi et dimanche »). Renvoie null si aucune heure n'est lisible.
 *
 * L'ancien parsing faisait `time.split('h')` : sur un horaire sans « h »
 * (« 14:00 »), le tableau n'avait qu'un élément, les minutes valaient
 * `undefined`, et `setHours(14, undefined)` produisait une date invalide —
 * `toISOString()` levait alors « Invalid time value » et l'ajout au calendrier
 * échouait entièrement.
 */
const parseTimeOfDay = (raw: string): { hours: number; minutes: number } | null => {
  const match = /(\d{1,2})\s*[h:]\s*(\d{1,2})?|(\d{1,2})\s*h/i.exec(raw ?? '');
  if (!match) return null;

  const hours = parseInt(match[1] ?? match[3], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (!Number.isFinite(hours) || hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

const FESTIVAL_TIMEZONE = 'Europe/Paris';

const parisParts = new Intl.DateTimeFormat('en-US', {
  timeZone: FESTIVAL_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Décalage de Paris par rapport à UTC, en minutes, pour un instant donné. */
const parisOffsetMinutes = (instant: Date): number => {
  const parts = Object.fromEntries(
    parisParts.formatToParts(instant).map(({ type, value }) => [type, value])
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - instant.getTime()) / 60000;
};

/**
 * Convertit une heure « de pendule » française en instant réel.
 *
 * Les exports calendrier sont en temps universel (suffixe Z) ; en construisant
 * les dates avec `new Date(...)` / `setHours()`, on utilisait le fuseau de
 * l'appareil. Un visiteur dont le téléphone est réglé sur Londres ou New York
 * voyait donc l'événement décalé d'une ou plusieurs heures. L'événement a lieu
 * en France : l'horaire du Google Sheet est toujours une heure de Paris.
 */
const parisWallClockToUtc = (
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): Date => {
  const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  // Deux passes : la première estimation peut tomber du mauvais côté d'un
  // changement d'heure, la seconde la corrige.
  let instant = naive - parisOffsetMinutes(new Date(naive)) * 60000;
  instant = naive - parisOffsetMinutes(new Date(instant)) * 60000;
  return new Date(instant);
};

/**
 * Calcule les dates de début et de fin réelles d'un événement du festival,
 * l'horaire saisi étant interprété à l'heure française.
 * Renvoie null si l'horaire de l'événement est illisible : mieux vaut une
 * erreur explicite qu'un événement placé à une date absurde.
 */
const getEventDates = (event: Event): { startDate: Date; endDate: Date } | null => {
  // Date réelle du week-end du festival — l'ancien calcul « prochain samedi
  // après aujourd'hui » créait l'événement le mauvais week-end (voire une date
  // fictive après le festival).
  const festivalDates = getFestivalDates();
  const dayKey = event.days?.includes('samedi') ? 'samedi' : 'dimanche';
  const [year, month, day] = festivalDates[dayKey].split('-').map(Number);

  const [rawStart, rawEnd] = (event.time ?? '').split(/\s*[-–]\s*/);
  const start = parseTimeOfDay(rawStart);
  if (!start) return null;

  // Sans heure de fin lisible, on prévoit une heure par défaut.
  const end = parseTimeOfDay(rawEnd ?? '') ?? { hours: start.hours + 1, minutes: start.minutes };

  const startDate = parisWallClockToUtc(year, month, day, start.hours, start.minutes);
  const endDate = parisWallClockToUtc(year, month, day, end.hours, end.minutes);

  // Une fin antérieure au début (horaire mal saisi) décalerait l'événement :
  // on retombe sur une durée d'une heure.
  if (endDate <= startDate) {
    endDate.setTime(startDate.getTime() + 60 * 60 * 1000);
  }

  return { startDate, endDate };
};

/** Format iCalendar UTC (RFC 5545) : YYYYMMDDTHHMMSSZ */
const formatCalendarDate = (date: Date): string =>
  date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

const EVENT_LOCATION = 'Île Feydeau, Nantes';

/**
 * Construit une URL « Google Agenda » pour l'événement.
 * C'est la méthode fiable sur Android : le lien ouvre directement
 * l'application Google Agenda (ou le web) avec l'événement pré-rempli.
 */
export const buildGoogleCalendarUrl = (event: Event): string | null => {
  const dates = getEventDates(event);
  if (!dates) return null;
  const { startDate, endDate } = dates;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatCalendarDate(startDate)}/${formatCalendarDate(endDate)}`,
    details: event.artistName || '',
    location: EVENT_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * Formate un événement pour l'export vers le calendrier
 */
const formatEventForCalendar = (event: Event): string | null => {
  const dates = getEventDates(event);
  if (!dates) return null;
  const { startDate, endDate } = dates;

  const formatText = (text: string): string => {
    return text.replace(/\n/g, '\\n').replace(/,/g, '\\,');
  };

  // Créer l'événement au format iCalendar
  const icalEvent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Collectif Feydeau//App//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@collectif-feydeau.app`,
    `DTSTAMP:${formatCalendarDate(new Date())}`,
    `DTSTART:${formatCalendarDate(startDate)}`,
    `DTEND:${formatCalendarDate(endDate)}`,
    `SUMMARY:${formatText(event.title)}`,
    `DESCRIPTION:${formatText(event.artistName || '')}`,
    `LOCATION:${formatText(EVENT_LOCATION)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icalEvent;
};

/**
 * Ouvre une URL externe via le clic sur une ancre (et non window.open, que
 * Chrome Android bloque en mode PWA standalone). Renvoie false si le document
 * n'est pas disponible, pour permettre un repli.
 */
const openExternalUrl = (url: string): boolean => {
  if (!document.body || !document.contains(document.body)) {
    return false;
  }
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
};

/**
 * Ajoute un événement au calendrier de l'appareil
 * Utilise différentes approches selon la plateforme
 */
export const addToCalendar = async (event: Event): Promise<CalendarResult> => {
  try {
    // Toujours retourner true pour la vérification de support
    // Nous allons gérer les différentes plateformes directement
    
    // Formater l'événement au format iCalendar
    const icalEvent = formatEventForCalendar(event);

    // Horaire illisible : on s'arrête ici avec un message explicite plutôt que
    // de laisser une date invalide faire échouer l'ensemble.
    if (!icalEvent) {
      logger.warn("Horaire illisible, ajout au calendrier impossible", { eventId: event.id, time: event.time });
      return {
        success: false,
        errorType: CalendarErrorType.GENERAL_ERROR,
        errorMessage: `Horaire de l'événement illisible : « ${event.time} »`
      };
    }
    
    // Détecter les plateformes
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    logger.info("Détection de plateforme", { isIOS, isAndroid, isMobile, userAgent: navigator.userAgent });
    
    // Créer le blob pour toutes les plateformes
    const blob = new Blob([icalEvent], { type: 'text/calendar;charset=utf-8' });
    
    // iOS : PAS de lien « webcal: » — remplacer le scheme d'une blob URL
    // (`webcal:https://…/uuid`) produit une URL irrésoluble : le clic ne faisait
    // rien tout en rapportant un succès. On passe par le partage de fichier
    // (navigator.share ci-dessous, qui propose Calendrier) ou le téléchargement
    // .ics, que Safari sait ouvrir dans Calendrier.

    // Android : le partage d'un simple texte + URL de la page n'ajoutait rien au
    // calendrier (aucune appli calendrier n'accepte ce type de partage), tout en
    // rapportant un succès. On ouvre désormais Google Agenda avec l'événement
    // pré-rempli, ce que gère l'application native comme le web.
    if (isAndroid) {
      const googleUrl = buildGoogleCalendarUrl(event);
      // On passe par le clic sur une ancre plutôt que window.open : dans une PWA
      // installée (mode standalone), Chrome Android traite window.open comme une
      // popup — elle est bloquée ou ouverte hors écran, tout en renvoyant un
      // objet fenêtre, donc on rapportait un succès sans rien afficher. Un clic
      // sur une ancre est une navigation utilisateur, qui ouvre bien
      // l'application Google Agenda (ou l'onglet web).
      if (googleUrl && openExternalUrl(googleUrl)) {
        logger.info("Google Agenda ouvert pour ajout au calendrier Android", { eventId: event.id });
        return { success: true };
      }
      logger.warn("Ouverture de Google Agenda impossible, repli sur le partage/téléchargement", { eventId: event.id });
    }

    // Essayer le partage de fichier (pour les appareils mobiles qui le supportent)
    if (isMobile && navigator.share) {
      try {
        // Créer un fichier à partir du blob
        const file = new File([blob], `${event.title.replace(/\s+/g, '_')}.ics`, { type: 'text/calendar' });
        
        // Vérifier si le partage de fichier est supporté
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Ajouter "${event.title}" à votre calendrier`,
            text: `Événement: ${event.title} - ${event.days.join(' et ')} à ${event.time}`
          });
          
          logger.info("Fichier partagé pour ajout au calendrier", { eventId: event.id });
          return { success: true };
        }
      } catch (shareError) {
        logger.warn("Erreur lors du partage de fichier", { shareError });
        // Continuer avec le téléchargement direct
      }
    }
    
    // Méthode universelle : téléchargement direct du fichier .ics
    // Cette méthode fonctionne sur la plupart des navigateurs desktop
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}.ics`);
      link.style.display = 'none'; // Masquer l'élément
      
      // Vérification sécurisée avant manipulation DOM
      if (document.body && document.contains(document.body)) {
        document.body.appendChild(link);
        link.click();
        
        // Cleanup sécurisé avec vérification
        if (document.body.contains(link)) {
          try {
            document.body.removeChild(link);
          } catch (removeError) {
            logger.warn('Error removing calendar download element:', removeError);
            // Fallback: essayer de supprimer via remove() si disponible
            if (link.remove) {
              link.remove();
            }
          }
        }
      } else {
        logger.warn('Document body not available for calendar download');
      }
      
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (revokeError) {
          logger.warn('Error revoking object URL:', revokeError);
        }
      }, 100);
    } catch (downloadError) {
      logger.error('Error in calendar download:', downloadError);
      throw downloadError; // Re-lancer l'erreur pour qu'elle soit gérée par le catch principal
    }
    
    logger.info("Fichier .ics téléchargé", { eventId: event.id, platform: isAndroid ? 'Android' : isIOS ? 'iOS' : 'Desktop' });
    return { success: true };
  } catch (error) {
    // Le détail est mis dans le message : passé en donnée, il se perd à la copie
    // depuis un téléphone (un Error se sérialise en « {} »).
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error(`Erreur lors de l'ajout au calendrier — ${detail}`, { error });
    return {
      success: false,
      errorType: CalendarErrorType.GENERAL_ERROR,
      errorMessage: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
    };
  }
};

/**
 * Crée un rappel pour un événement
 * Utilise les notifications natives si disponibles, sinon utilise le système de notification interne
 */
export const createReminder = async (event: Event, reminderTime: Date): Promise<CalendarResult> => {
  try {
    // Vérifier si les notifications sont supportées
    if (!('Notification' in window)) {
      logger.warn("Notifications non supportées");
      return {
        success: false,
        errorType: CalendarErrorType.NOT_SUPPORTED,
        errorMessage: "Les notifications ne sont pas supportées sur cet appareil"
      };
    }
    
    // Demander la permission si nécessaire
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        logger.warn("Permission de notification refusée");
        return {
          success: false,
          errorType: CalendarErrorType.PERMISSION_DENIED,
          errorMessage: "Permission refusée pour les notifications"
        };
      }
    }
    
    // Calculer le délai jusqu'au rappel
    const now = new Date();
    const timeUntilReminder = reminderTime.getTime() - now.getTime();
    
    if (timeUntilReminder <= 0) {
      logger.warn("La date de rappel est déjà passée");
      return {
        success: false,
        errorType: CalendarErrorType.GENERAL_ERROR,
        errorMessage: "La date de rappel est déjà passée"
      };
    }
    
    // Enregistrer le rappel dans le service worker si disponible
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        payload: {
          id: `reminder-${event.id}`,
          title: `Rappel: ${event.title}`,
          body: `${event.days.join(' et ')} à ${event.time} - Île Feydeau, Nantes`,
          timestamp: reminderTime.getTime()
        }
      });
      
      logger.info("Rappel programmé via service worker", { 
        eventId: event.id, 
        reminderTime: reminderTime.toISOString() 
      });
      
      return { success: true };
    } else {
      // Fallback: utiliser setTimeout (ne fonctionne que si l'application reste ouverte)
      setTimeout(() => {
        new Notification(`Rappel: ${event.title}`, {
          body: `${event.days.join(' et ')} à ${event.time} - Île Feydeau, Nantes`,
          icon: '/icon-192x192.png'
        });
      }, timeUntilReminder);
      
      logger.info("Rappel programmé via setTimeout", { 
        eventId: event.id, 
        reminderTime: reminderTime.toISOString() 
      });
      
      return { success: true };
    }
  } catch (error) {
    logger.error("Erreur lors de la création du rappel", { error });
    return {
      success: false,
      errorType: CalendarErrorType.GENERAL_ERROR,
      errorMessage: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
    };
  }
};

