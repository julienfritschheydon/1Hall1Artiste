// Insère des transformations Cloudinary dans une URL d'image pour servir une vignette
// recadrée (cadrage intelligent g_auto), compressée et au bon format, bien plus légère.
// Si l'URL n'est pas une URL Cloudinary, elle est renvoyée inchangée.

export function cloudinaryThumb(
  url: string | undefined | null,
  width: number,
  height: number
): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  // Évite de doubler une transformation déjà présente.
  if (/\/upload\/[^/]*[wc]_\d/.test(url)) return url;
  const transform = `w_${width},h_${height},c_fill,g_auto,q_auto,f_auto`;
  return url.replace("/upload/", `/upload/${transform}/`);
}
