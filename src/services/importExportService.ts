import { Event } from "@/data/events";
import { Location } from "@/data/locations";
import { createLogger } from "@/utils/logger";
import { dataService } from "./dataService";
import { validateEvent, validateLocation } from "./validationService";

// Créer un logger pour le service d'import/export
const logger = createLogger('ImportExportService');

// Types pour les données d'import/export
export interface ExportData {
  events: Event[];
  locations: Location[];
  exportDate: string;
  version: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  importedEvents?: number;
  importedLocations?: number;
  errors?: string[];
}

// Version actuelle du format d'export
const EXPORT_VERSION = "1.0.0";

/**
 * Parse une ligne CSV en tableau de valeurs en tenant compte des guillemets.
 * - Les virgules à l'intérieur de guillemets ne séparent pas les champs.
 * - Les guillemets doublés ("") à l'intérieur d'un champ quoté sont un guillemet littéral.
 */
export const parseCSVLine = (line: string): string[] => {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Deux guillemets consécutifs à l'intérieur d'une chaîne entre guillemets
      if (insideQuotes && i + 1 < line.length && line[i + 1] === '"') {
        currentValue += '"';
        i++; // Sauter le prochain guillemet
      } else {
        // Basculer l'état "à l'intérieur des guillemets"
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Fin d'une valeur
      values.push(currentValue);
      currentValue = '';
    } else {
      // Ajouter le caractère à la valeur actuelle
      currentValue += char;
    }
  }

  // Ajouter la dernière valeur
  values.push(currentValue);

  return values;
};

/**
 * Exporte toutes les données de l'application au format JSON
 */
export const exportAllData = (): string => {
  logger.info('Exportation de toutes les données');
  
  try {
    const { events, locations } = dataService.getState();
    
    const exportData: ExportData = {
      events,
      locations,
      exportDate: new Date().toISOString(),
      version: EXPORT_VERSION
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    logger.info(`Exportation réussie: ${events.length} événements et ${locations.length} lieux`);
    
    return jsonData;
  } catch (error) {
    logger.error('Erreur lors de l\'exportation des données', error);
    throw new Error('Erreur lors de l\'exportation des données');
  }
};

/**
 * Exporte uniquement les événements au format JSON
 */
export const exportEvents = (): string => {
  logger.info('Exportation des événements');
  
  try {
    const { events } = dataService.getState();
    
    const exportData = {
      events,
      exportDate: new Date().toISOString(),
      version: EXPORT_VERSION
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    logger.info(`Exportation réussie: ${events.length} événements`);
    
    return jsonData;
  } catch (error) {
    logger.error('Erreur lors de l\'exportation des événements', error);
    throw new Error('Erreur lors de l\'exportation des événements');
  }
};

/**
 * Exporte uniquement les lieux au format JSON
 */
export const exportLocations = (): string => {
  logger.info('Exportation des lieux');
  
  try {
    const { locations } = dataService.getState();
    
    const exportData = {
      locations,
      exportDate: new Date().toISOString(),
      version: EXPORT_VERSION
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    logger.info(`Exportation réussie: ${locations.length} lieux`);
    
    return jsonData;
  } catch (error) {
    logger.error('Erreur lors de l\'exportation des lieux', error);
    throw new Error('Erreur lors de l\'exportation des lieux');
  }
};

/**
 * Exporte les données au format CSV
 */
export const exportEventsToCSV = (): string => {
  logger.info('Exportation des événements au format CSV');
  
  try {
    const { events } = dataService.getState();
    
    // Définir les en-têtes CSV
    const headers = [
      'id',
      'title',
      'artistName',
      'type',
      'artistBio',
      'time',
      'days',
      'locationName'
    ];
    
    // Convertir les événements en lignes CSV
    const rows = events.map(event => {
      const values = [
        event.id,
        `"${event.title.replace(/"/g, '""')}"`,
        `"${event.artistName.replace(/"/g, '""')}"`,
        event.type,
        `"${event.artistBio.replace(/"/g, '""')}"`,
        `"${event.time.replace(/"/g, '""')}"`,
        `"${event.days.join(',')}"`,
        `"${event.locationName.replace(/"/g, '""')}"`
      ];
      
      return values.join(',');
    });
    
    // Assembler le CSV final
    const csv = [headers.join(','), ...rows].join('\n');
    logger.info(`Exportation CSV réussie: ${events.length} événements`);
    
    return csv;
  } catch (error) {
    logger.error('Erreur lors de l\'exportation des événements au format CSV', error);
    throw new Error('Erreur lors de l\'exportation des événements au format CSV');
  }
};

// Dates du festival (troisième week-end de septembre 2026)
const FESTIVAL_DATES: Record<string, string> = {
  samedi: '2026-09-19',
  dimanche: '2026-09-20',
};
const FESTIVAL_TIMEZONE = '+02:00';

function parseEventTime(timeStr: string): { start: string; end: string } | null {
  const match = timeStr.match(/(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})/);
  if (!match) return null;
  const [, sh, sm, eh, em] = match;
  return {
    start: `${sh.padStart(2, '0')}:${sm}`,
    end: `${eh.padStart(2, '0')}:${em}`,
  };
}

function buildOpenAgendaTimings(event: Event): string {
  const times = parseEventTime(event.time);
  if (!times) return '';
  return event.days
    .map(day => {
      const date = FESTIVAL_DATES[day];
      if (!date) return null;
      return `${date}T${times.start}:00${FESTIVAL_TIMEZONE}/${date}T${times.end}:00${FESTIVAL_TIMEZONE}`;
    })
    .filter(Boolean)
    .join(';');
}

function escapeCSV(value: string): string {
  return `"${(value || '').replace(/"/g, '""')}"`;
}

/**
 * Exporte les événements au format CSV OpenAgenda
 */
export const exportEventsToOpenAgendaCSV = (): string => {
  logger.info('Exportation des événements au format OpenAgenda CSV');

  try {
    const { events, locations } = dataService.getState();

    const headers = [
      'title[fr]',
      'description[fr]',
      'timings',
      'location.name',
      'location.address',
      'location.city',
      'location.country',
      'image.url',
      'keywords[fr]',
      'free',
      'status',
    ];

    const rows = events.map(event => {
      const location = locations.find(l => l.id === event.locationId);
      const timings = buildOpenAgendaTimings(event);
      const description = (event as { artistBio?: string; presentation?: string }).artistBio || (event as { artistBio?: string; presentation?: string }).presentation || '';
      const imageUrl = event.image
        ? `https://collectif-feydeau.fr${event.image.startsWith('/') ? '' : '/'}${event.image}`
        : '';
      const keyword = event.type === 'concert' ? 'concert' : 'exposition';

      return [
        escapeCSV(event.title),
        escapeCSV(description),
        escapeCSV(timings),
        escapeCSV(location?.name || event.locationName),
        escapeCSV('Île Feydeau'),
        escapeCSV('Nantes'),
        escapeCSV('FR'),
        escapeCSV(imageUrl),
        escapeCSV(keyword),
        '1',
        '1',
      ].join(',');
    });

    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    logger.info(`Exportation OpenAgenda réussie: ${events.length} événements`);
    return csv;
  } catch (error) {
    logger.error('Erreur lors de l\'exportation OpenAgenda', error);
    throw new Error('Erreur lors de l\'exportation OpenAgenda');
  }
};

/**
 * Importe des données depuis un fichier JSON
 */
export const importData = (jsonData: string): ImportResult => {
  logger.info('Importation de données depuis JSON');
  
  try {
    const importedData = JSON.parse(jsonData);
    const errors: string[] = [];
    let importedEvents = 0;
    let importedLocations = 0;
    
    // Vérifier la structure des données importées
    if (!importedData) {
      return {
        success: false,
        message: 'Données d\'importation invalides',
        errors: ['Format JSON invalide']
      };
    }
    
    // Importer les lieux si présents
    if (importedData.locations && Array.isArray(importedData.locations)) {
      logger.info(`Tentative d'importation de ${importedData.locations.length} lieux`);
      
      for (const location of importedData.locations) {
        // Valider chaque lieu
        const validationResult = validateLocation(location);
        
        if (validationResult.isValid) {
          const result = dataService.addLocation(location);
          
          if (result.success) {
            importedLocations++;
          } else if (result.error) {
            errors.push(`Erreur lors de l'importation du lieu ${location.id || 'sans ID'}: ${result.error}`);
          }
        } else {
          const errorFields = validationResult.errors.map(e => `${e.field}: ${e.message}`).join(', ');
          errors.push(`Validation échouée pour le lieu ${location.id || 'sans ID'}: ${errorFields}`);
        }
      }
    }
    
    // Importer les événements si présents
    if (importedData.events && Array.isArray(importedData.events)) {
      logger.info(`Tentative d'importation de ${importedData.events.length} événements`);
      
      for (const event of importedData.events) {
        // Valider chaque événement
        const validationResult = validateEvent(event);
        
        if (validationResult.isValid) {
          const result = dataService.addEvent(event);
          
          if (result.success) {
            importedEvents++;
          } else if (result.error) {
            errors.push(`Erreur lors de l'importation de l'événement ${event.id || 'sans ID'}: ${result.error}`);
          }
        } else {
          const errorFields = validationResult.errors.map(e => `${e.field}: ${e.message}`).join(', ');
          errors.push(`Validation échouée pour l'événement ${event.id || 'sans ID'}: ${errorFields}`);
        }
      }
    }
    
    // Générer le message de résultat
    let message = '';
    if (importedLocations > 0) {
      message += `${importedLocations} lieu(x) importé(s). `;
    }
    
    if (importedEvents > 0) {
      message += `${importedEvents} événement(s) importé(s).`;
    }
    
    if (importedLocations === 0 && importedEvents === 0) {
      message = 'Aucune donnée importée.';
    }
    
    // Sauvegarder les changements
    dataService.saveToLocalStorage();
    
    return {
      success: importedEvents > 0 || importedLocations > 0,
      message,
      importedEvents,
      importedLocations,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    logger.error('Erreur lors de l\'importation des données', error);
    
    return {
      success: false,
      message: 'Erreur lors de l\'importation des données',
      errors: [(error as Error).message]
    };
  }
};

/**
 * Importe des événements depuis un fichier CSV
 */
export const importEventsFromCSV = (csvData: string): ImportResult => {
  logger.info('Importation d\'événements depuis CSV');
  
  try {
    // Découper le CSV en lignes
    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      return {
        success: false,
        message: 'Le fichier CSV ne contient pas suffisamment de données',
        errors: ['Format CSV invalide']
      };
    }
    
    // Extraire les en-têtes
    const headers = lines[0].split(',');
    
    // Vérifier que les en-têtes nécessaires sont présents
    const requiredHeaders = ['id', 'title', 'artistName', 'type', 'locationName'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    
    if (missingHeaders.length > 0) {
      return {
        success: false,
        message: `En-têtes manquants dans le fichier CSV: ${missingHeaders.join(', ')}`,
        errors: [`En-têtes manquants: ${missingHeaders.join(', ')}`]
      };
    }
    
    // Convertir les lignes en événements
    const events: Event[] = [];
    const errors: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        const event: Record<string, unknown> = {};
        
        // Associer chaque valeur à son en-tête
        for (let j = 0; j < headers.length; j++) {
          if (j < values.length) {
            const header = headers[j];
            const value = values[j];
            
            // Convertir certains champs en types spécifiques
            if (header === 'x' || header === 'y') {
              event[header] = parseFloat(value);
            } else if (header === 'days') {
              event[header] = value.split(',').map(day => day.trim());
            } else {
              event[header] = value;
            }
          }
        }
        
        // Valider l'événement
        const validationResult = validateEvent(event as unknown as Event);
        
        if (validationResult.isValid) {
          events.push(event as unknown as Event);
        } else {
          const errorFields = validationResult.errors.map(e => `${e.field}: ${e.message}`).join(', ');
          errors.push(`Ligne ${i + 1}: Validation échouée - ${errorFields}`);
        }
      } catch (error) {
        errors.push(`Erreur lors du traitement de la ligne ${i + 1}: ${(error as Error).message}`);
      }
    }
    
    // Importer les événements valides
    let importedCount = 0;
    
    for (const event of events) {
      const result = dataService.addEvent(event);
      
      if (result.success) {
        importedCount++;
      } else if (result.error) {
        errors.push(`Erreur lors de l'importation de l'événement ${event.id}: ${result.error}`);
      }
    }
    
    // Sauvegarder les changements
    dataService.saveToLocalStorage();
    
    return {
      success: importedCount > 0,
      message: `${importedCount} événement(s) importé(s) sur ${events.length} événements valides.`,
      importedEvents: importedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    logger.error('Erreur lors de l\'importation des événements depuis CSV', error);
    
    return {
      success: false,
      message: 'Erreur lors de l\'importation des événements depuis CSV',
      errors: [(error as Error).message]
    };
  }
};

