// Artists data for exhibitions and concerts
export type Artist = {
  id: string;
  name: string;
  type: "exposition" | "concert";
  title: string;
  instagram?: string;
  image?: string;
  // Nouveaux champs pour les concerts
  email?: string;
  photos?: string[];
  videos?: string[]; // Tableau de liens vers des vidéos (YouTube, Vimeo, etc.)
  presentation?: string;
  link?: string;
  website?: string;
  facebook?: string;
  phone?: string;
  director?: string;
  members?: string; // Liste des membres pour les groupes/ensembles
  youtube?: string;
  tiktok?: string;
};

// Données vides — les artistes sont chargés dynamiquement depuis /api/program (Vercel Function).
export const artists: Artist[] = [];

// Fonctions utilitaires
export function getArtistById(id: string): Artist | undefined {
  return artists.find(artist => artist.id === id);
}

export function getAllArtists(): Artist[] {
  return artists;
}

export function getArtistsByType(type: "exposition" | "concert"): Artist[] {
  return artists.filter(artist => artist.type === type);
}
