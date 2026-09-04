// Session admin côté client.
//
// Le code n'est plus comparé ici (il était lisible dans le bundle) : il part au serveur,
// qui renvoie un token signé. Ce token n'est qu'un laissez-passer opaque pour le client —
// c'est le serveur qui vérifie sa signature à chaque appel admin.

const TOKEN_KEY = "adminToken";

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function isAdminAuthenticated(): boolean {
  return getAdminToken() !== "";
}

export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    // Vestige de l'authentification purement client, retiré si présent.
    sessionStorage.removeItem("adminAuthenticated");
  } catch {
    /* sessionStorage indisponible (navigation privée stricte) */
  }
}

// Échange le mot de passe contre un token. Lève une erreur lisible en cas de refus.
export async function adminLogin(password: string): Promise<void> {
  // Le login vit dans /api/artist-link (action explicite) : le plan Vercel Hobby
  // plafonne à 12 fonctions serverless et le projet est à la limite.
  const res = await fetch("/api/artist-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "admin-login", password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Connexion impossible");
  }

  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error("Réponse inattendue du serveur");

  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new Error("Impossible de mémoriser la session (stockage bloqué)");
  }
}

// Récupère le lien d'édition d'une fiche, tel que l'artiste le recevrait par email.
export async function fetchArtistEditLink(
  artistId: string
): Promise<{ link: string; email: string; artistIds: string[] }> {
  const res = await fetch("/api/artist-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminToken: getAdminToken(), artistId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Génération du lien impossible");
  }

  return (await res.json()) as { link: string; email: string; artistIds: string[] };
}
