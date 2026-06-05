import { getArtistById, Artist } from './artists';
import { getLocationNameById } from './locations';

// Type for event-specific details, linking to an artist via artistId
export type EventDetails = {
  id: string; // Unique ID for this specific event instance
  artistId: string; // Foreign key to artists.ts
  title: string; // Event's own title
  // description: string; // Event's own description
  time: string;
  days: ("samedi" | "dimanche")[];
  locationId: string; // Référence à l'ID du lieu dans locations.ts
};

// Combined Event type that components will use
// It mirrors the structure of the old Event type for compatibility
export type Event = {
  // Fields from EventDetails
  id: string;
  artistId: string;
  title: string; // Event's title
  // description: string; // Event's description
  time: string;
  days: ("samedi" | "dimanche")[];
  locationId: string;
  locationName: string;

  // Fields from Artist (kept for compatibility)
  artistName: Artist['name'];
  type: Artist['type']; // 'exposition' or 'concert'
  image?: Artist['image'];
  imageUrl?: string; // Vignette résolue (thumbnail artiste prioritaire) — lue par EventImage
};

// Données vides — le programme est chargé dynamiquement depuis /api/program (Vercel Function).
const eventScheduleData: EventDetails[] = [];

// Dynamically construct the events array by merging EventDetails with Artist data
export const events: Event[] = eventScheduleData.map(eventDetail => {
  const artist = getArtistById(eventDetail.artistId);

  if (!artist) {
    // This case should ideally not happen if artistId always refers to a valid artist.
    // Handle error: log it, and potentially return a default/error object or filter out.
    console.error(`Artist not found for ID: ${eventDetail.artistId} (Event ID: ${eventDetail.id}). Check data consistency.`);
    // For robustness, you might want to throw an error or return a distinctly identifiable error object.
    // Returning null here and filtering later, but this might hide issues during development.
    return null;
  }

  return {
    // From EventDetails
    id: eventDetail.id,
    artistId: eventDetail.artistId,
    title: eventDetail.title,
    // description: eventDetail.description,
    time: eventDetail.time,
    days: eventDetail.days,
    locationId: eventDetail.locationId,
    locationName: getLocationNameById(eventDetail.locationId),

    // From Artist
    artistName: artist.name,
    type: artist.type,
    image: artist.image,
  };
}).filter(event => event !== null) as Event[]; // Filter out any nulls if artists weren't found

// Helper functions (preserved from original file)
export function getEventsByDay(day: "samedi" | "dimanche") {
  return events.filter(event => event.days.includes(day));
}

export function getEventById(id: string) {
  return events.find(event => event.id === id);
}

export function getEventsByLocation(locationName: string) {
  // Récupérer le lieu par son nom
  const locations = getLocations();
  const location = locations.find(loc => loc.name === locationName);
  
  if (location) {
    // Si on a trouvé le lieu, récupérer les événements qui ont ce locationId
    return events.filter(event => event.locationId === location.id);
  }
  
  // Si on ne trouve pas le lieu, retourner un tableau vide
  return [];
}

// Get unique locations from events
export function getLocations() {
  const uniqueLocations = new Map<string, { id: string, name: string, description: string, x: number, y: number, events: string[], visited: boolean }>();
  
  // Import locations data and use it as the primary source for location information
  try {
    import('../data/locations').then(locationsModule => {
      const locationsData = locationsModule.locations;
      
      // Create a map of events by locationId
      const eventsByLocation = new Map<string, string[]>();
      events.forEach(event => {
        if (!eventsByLocation.has(event.locationId)) {
          eventsByLocation.set(event.locationId, [event.id]);
        } else {
          eventsByLocation.get(event.locationId)?.push(event.id);
        }
      });
      
      // Use locations data as the primary source
      locationsData.forEach(location => {
        const eventIds = eventsByLocation.get(location.id) || [];
        uniqueLocations.set(location.name, {
          id: location.id,
          name: location.name,
          description: location.description,
          x: location.x,
          y: location.y,
          events: eventIds,
          visited: location.visited || false
        });
      });
    }).catch(error => {
      console.warn('Could not load locations data:', error);
      // Fallback to using event data if locations cannot be loaded
      populateSynchronously();
    });
  } catch (error) {
    console.warn('Dynamic import not available, using fallback for locations:', error);
    populateSynchronously();
  }

  // Fallback function that uses event data to populate locations
  function populateSynchronously() {
    // Group events by location
    const eventsByLocation = new Map<string, string[]>();
    events.forEach(event => {
      if (!eventsByLocation.has(event.locationId)) {
        eventsByLocation.set(event.locationId, [event.id]);
      } else {
        eventsByLocation.get(event.locationId)?.push(event.id);
      }
    });
    
    // Create location entries with default coordinates
    // Note: In this fallback mode, we don't have actual coordinates
    // so we use a default value that will be corrected when locations.ts is loaded
    events.forEach(event => {
      if (!uniqueLocations.has(event.locationName)) {
        uniqueLocations.set(event.locationName, {
          id: event.locationId,
          name: event.locationName,
          description: '', // Default empty description
          x: 0, // Default coordinate, will be updated from locations.ts when available
          y: 0, // Default coordinate, will be updated from locations.ts when available
          events: eventsByLocation.get(event.locationId) || [],
          visited: false
        });
      }
    });
  }

  // Initial synchronous population before async attempt or as fallback
  if (uniqueLocations.size === 0) {
      populateSynchronously();
  }
  
  return Array.from(uniqueLocations.values());
}

// Get location ID from event ID
export function getLocationIdForEvent(eventId: string): string | null {
  const event = getEventById(eventId);
  if (!event) return null;
  
  return event.locationId;
}

