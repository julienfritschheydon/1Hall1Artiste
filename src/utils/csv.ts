// Neutralise l'injection de formules tableur : une cellule commençant par
// = + - @ (ou tab/CR) est interprétée comme formule par Excel/LibreOffice à
// l'ouverture — un inscrit malveillant pouvait exécuter du code sur le poste
// du guide via son prénom. Préfixe apostrophe = affichage texte.
export function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
