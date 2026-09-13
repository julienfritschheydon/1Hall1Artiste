// Détecte si on est sur navigateur Android pour adapter format image
function isAndroidBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

// Insère des transformations Cloudinary dans une URL d'image pour servir une vignette
// recadrée (cadrage intelligent g_auto), compressée et au bon format, bien plus légère.
// Si l'URL n'est pas une URL Cloudinary, elle est renvoyée inchangée.
// Sur Android, utilise format JPEG explicite pour éviter incompatibilités WebP/AVIF
export function cloudinaryThumb(
  url: string | undefined | null,
  width: number,
  height: number
): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  // Évite de doubler une transformation déjà présente.
  if (/\/upload\/[^/]*[wc]_\d/.test(url)) return url;

  // Sur Android, forcer format JPEG pour compatibilité
  const isAndroid = isAndroidBrowser();
  const format = isAndroid ? 'f_jpg,q_auto' : 'f_auto,q_auto';
  const transform = `w_${width},h_${height},c_fill,g_auto,${format}`;
  return url.replace("/upload/", `/upload/${transform}/`);
}

// Optimise une URL Cloudinary (compression + format automatiques) sans recadrer
// ni redimensionner l'image. À utiliser pour les affichages en pleine taille
// (ex: image détaillée d'un lieu) où cloudinaryThumb() couperait le sujet.
// Sur Android, utilise format JPEG explicite pour éviter incompatibilités.
export function cloudinaryOptimize(url: string | undefined | null): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  if (/\/upload\/[^/]*[wc]_\d/.test(url)) return url;

  // Sur Android, forcer format JPEG pour compatibilité
  const isAndroid = isAndroidBrowser();
  const format = isAndroid ? 'f_jpg,q_auto' : 'f_auto,q_auto';
  return url.replace("/upload/", `/upload/${format}/`);
}

// Récupère URL image originale sans transformations (utile pour téléchargement)
export function cloudinaryOriginal(url: string | undefined | null): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  // Retirer les transformations présentes
  return url.replace(/\/upload\/[^/]+\//, '/upload/');
}
