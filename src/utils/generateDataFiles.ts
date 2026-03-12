import { Event } from '@/data/events';
import { Location } from '@/data/locations';
import { Artist } from '@/data/artists';

/**
 * Génère le contenu du fichier events.ts à partir des données
 */
export function generateEventsFile(events: Event[]): string {
  // Extraire les EventDetails (sans les données Artist)
  const eventDetails = events.map(event => ({
    id: event.id,
    artistId: event.artistId,
    title: event.title,
    time: event.time,
    days: event.days,
    locationId: event.locationId
  }));

  return `import { getArtistById, Artist } from './artists';
import { getLocationNameById } from './locations';

// Type for event-specific details, linking to an artist via artistId
export type EventDetails = {
  id: string; // Unique ID for this specific event instance
  artistId: string; // Foreign key to artists.ts
  title: string; // Event's own title
  time: string;
  days: ("samedi" | "dimanche")[];
  locationId: string; // Référence à l'ID du lieu dans locations.ts
};

// Combined Event type that components will use
export type Event = {
  // Fields from EventDetails
  id: string;
  artistId: string;
  title: string;
  time: string;
  days: ("samedi" | "dimanche")[];
  locationId: string;
  locationName: string;

  // Fields from Artist (kept for compatibility)
  artistName: Artist['name'];
  type: Artist['type']; // 'exposition' or 'concert'
  image?: Artist['image'];
};

// Raw schedule data: list of event-specific details
const eventScheduleData: EventDetails[] = ${JSON.stringify(eventDetails, null, 2)};

// Dynamically construct the events array by merging EventDetails with Artist data
export const events: Event[] = eventScheduleData.map(eventDetail => {
  const artist = getArtistById(eventDetail.artistId);

  if (!artist) {
    console.error(\`Artist not found for ID: \${eventDetail.artistId} (Event ID: \${eventDetail.id}). Check data consistency.\`);
    return null;
  }

  return {
    // From EventDetails
    id: eventDetail.id,
    artistId: eventDetail.artistId,
    title: eventDetail.title,
    time: eventDetail.time,
    days: eventDetail.days,
    locationId: eventDetail.locationId,
    locationName: getLocationNameById(eventDetail.locationId),

    // From Artist
    artistName: artist.name,
    type: artist.type,
    image: artist.image,
  };
}).filter(event => event !== null) as Event[];

// Helper functions
export function getEventsByDay(day: "samedi" | "dimanche") {
  return events.filter(event => event.days.includes(day));
}

export function getEventById(id: string) {
  return events.find(event => event.id === id);
}

export function getEventsByLocation(locationName: string) {
  const locations = getLocations();
  const location = locations.find(loc => loc.name === locationName);
  
  if (location) {
    return events.filter(event => event.locationId === location.id);
  }
  
  return [];
}

export function getLocations() {
  const uniqueLocations = new Map<string, { id: string, name: string, description: string, x: number, y: number, events: string[], visited: boolean }>();
  
  try {
    import('../data/locations').then(locationsModule => {
      const locationsData = locationsModule.locations;
      
      const eventsByLocation = new Map<string, string[]>();
      events.forEach(event => {
        if (!eventsByLocation.has(event.locationId)) {
          eventsByLocation.set(event.locationId, [event.id]);
        } else {
          eventsByLocation.get(event.locationId)?.push(event.id);
        }
      });
      
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
      populateSynchronously();
    });
  } catch (error) {
    console.warn('Dynamic import not available, using fallback for locations:', error);
    populateSynchronously();
  }

  function populateSynchronously() {
    const eventsByLocation = new Map<string, string[]>();
    events.forEach(event => {
      if (!eventsByLocation.has(event.locationId)) {
        eventsByLocation.set(event.locationId, [event.id]);
      } else {
        eventsByLocation.get(event.locationId)?.push(event.id);
      }
    });
    
    events.forEach(event => {
      if (!uniqueLocations.has(event.locationName)) {
        uniqueLocations.set(event.locationName, {
          id: event.locationId,
          name: event.locationName,
          description: '',
          x: 0,
          y: 0,
          events: eventsByLocation.get(event.locationId) || [],
          visited: false
        });
      }
    });
  }

  if (uniqueLocations.size === 0) {
      populateSynchronously();
  }
  
  return Array.from(uniqueLocations.values());
}

export function getLocationIdForEvent(eventId: string): string | null {
  const event = getEventById(eventId);
  if (!event) return null;
  
  return event.locationId;
}
`;
}

/**
 * Génère le contenu du fichier artists.ts à partir des données
 */
export function generateArtistsFile(events: Event[]): string {
  // Extraire les artistes uniques depuis les événements
  interface ArtistData {
    id: string;
    name: string;
    type: 'exposition' | 'concert';
    title: string;
    presentation: string;
    image: string;
    instagram: string;
    email: string;
    phone: string;
    photos: string[];
    videos: string[];
  }
  
  const artistsMap = new Map<string, ArtistData>();
  
  events.forEach(event => {
    if (!artistsMap.has(event.artistId)) {
      artistsMap.set(event.artistId, {
        id: event.artistId,
        name: event.artistName,
        type: event.type,
        title: event.title,
        presentation: '', // Sera rempli par l'import détails artistes
        image: event.image || '',
        instagram: '',
        email: '',
        phone: '',
        photos: [],
        videos: []
      });
    }
  });

  const artists = Array.from(artistsMap.values());

  return `// Artists data for exhibitions and concerts
export type Artist = {
  id: string;
  name: string;
  type: "exposition" | "concert";
  title: string;
  instagram?: string;
  image?: string;
  email?: string;
  photos?: string[];
  videos?: string[];
  presentation?: string;
  link?: string;
  website?: string;
  facebook?: string;
  phone?: string;
  director?: string;
  members?: string;
  youtube?: string;
  tiktok?: string;
};

export const artists: Artist[] = ${JSON.stringify(artists, null, 2)};

export function getArtistById(id: string): Artist | undefined {
  return artists.find(artist => artist.id === id);
}

export function getArtistsByType(type: "exposition" | "concert"): Artist[] {
  return artists.filter(artist => artist.type === type);
}
`;
}

/**
 * Génère le contenu du fichier locations.ts à partir des données
 */
export function generateLocationsFile(locations: Location[]): string {
  return `export type Location = {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  visited?: boolean;
  type?: "exposition" | "concert" | "both";
};

export const locations: Location[] = ${JSON.stringify(locations, null, 2)};

export function getLocationById(id: string): Location | undefined {
  return locations.find(location => location.id === id);
}

export function getLocationNameById(id: string): string {
  const location = getLocationById(id);
  return location ? location.name : '';
}

export function getLocationsByType(type: "exposition" | "concert"): Location[] {
  return locations.filter(location => 
    location.type === type || location.type === "both"
  );
}
`;
}

/**
 * Génère tous les fichiers de données
 */
export function generateAllDataFiles(events: Event[], locations: Location[]): {
  eventsFile: string;
  artistsFile: string;
  locationsFile: string;
} {
  return {
    eventsFile: generateEventsFile(events),
    artistsFile: generateArtistsFile(events),
    locationsFile: generateLocationsFile(locations)
  };
}
