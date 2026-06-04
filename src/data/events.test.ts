import { describe, it, expect } from 'vitest';
import { events, getEventsByLocation } from './events';
import { getArtistById } from './artists';
import { getLocationNameById, getLocations } from './locations';

// NB : les données statiques `events` sont désormais vides — le programme est
// chargé dynamiquement depuis /api/program. Ces tests valident donc le contrat
// des fonctions et l'intégrité des événements *quand* ils sont présents, sans
// supposer un jeu de données statique.

describe('Event functions', () => {
  it('getEventsByLocation retourne un tableau', () => {
    const locations = getLocations();
    const name = locations[0]?.name ?? 'Lieu inconnu';
    const result = getEventsByLocation(name);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getEventsByLocation retourne un tableau vide pour un lieu inexistant', () => {
    const result = getEventsByLocation('Location-Qui-Nexiste-Pas-xyz');
    expect(result).toEqual([]);
  });

  it('chaque événement présent a des données artiste cohérentes', () => {
    events.forEach(event => {
      const artist = getArtistById(event.artistId);
      expect(artist).toBeDefined();
      if (artist) {
        expect(event.artistName).toBe(artist.name);
        expect(event.type).toBe(artist.type);
      }
    });
  });

  it('chaque événement présent référence un lieu valide', () => {
    const locationIds = getLocations().map(loc => loc.id);
    events.forEach(event => {
      expect(typeof event.locationId).toBe('string');
      expect(locationIds).toContain(event.locationId);
      expect(event.locationName).toBe(getLocationNameById(event.locationId));
    });
  });

  it('chaque événement présent a les propriétés requises', () => {
    events.forEach(event => {
      expect(typeof event.id).toBe('string');
      expect(typeof event.title).toBe('string');
      expect(typeof event.time).toBe('string');
      expect(Array.isArray(event.days)).toBe(true);
      expect(typeof event.artistId).toBe('string');
      expect(typeof event.artistName).toBe('string');
      expect(['exposition', 'concert'].includes(event.type)).toBe(true);
    });
  });
});
