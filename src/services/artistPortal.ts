// Client du portail artiste : décodage local du token (pour pré-remplir) + appels API.
// La sécurité réelle (signature HMAC) est vérifiée côté serveur dans /api/artist-update.

export const ARTIST_EDITABLE_FIELDS = [
  "presentation",
  "instagram",
  "facebook",
  "website",
  "thumbnail",
] as const;

export type ArtistFields = Partial<Record<(typeof ARTIST_EDITABLE_FIELDS)[number], string>>;

export interface DecodedToken {
  artistId: string;
  email: string;
  exp: number;
  expired: boolean;
}

function fromB64url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

// Décode le payload du token SANS vérifier la signature (impossible côté client).
// Sert uniquement à pré-remplir le formulaire et détecter l'expiration pour l'UX.
export function decodeToken(token: string): DecodedToken | null {
  try {
    const [payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const payload = fromB64url(payloadB64);
    const [artistId, email, expStr] = payload.split("|");
    const exp = Number(expStr);
    if (!artistId || !email || !Number.isFinite(exp)) return null;
    return { artistId, email, exp, expired: Date.now() > exp };
  } catch {
    return null;
  }
}

// Upload de la vignette vers Cloudinary (preset non-signé, partagé avec la galerie communautaire).
export async function uploadThumbnail(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "collectif_photos");
  formData.append("cloud_name", "dpatqkgsc");

  const res = await fetch("https://api.cloudinary.com/v1_1/dpatqkgsc/image/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload Cloudinary échoué (${res.status})`);
  const data = await res.json();
  return data.secure_url as string;
}

// Enregistre les champs édités. Renvoie une erreur lisible si le token est refusé.
export async function saveArtistFields(token: string, fields: ArtistFields): Promise<void> {
  const res = await fetch("/api/artist-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, fields }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Échec de l'enregistrement");
  }
}

// Demande l'envoi d'un (nouveau) lien magique par email.
export async function requestMagicLink(email: string): Promise<void> {
  const res = await fetch("/api/artist-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Échec de l'envoi du lien");
}
