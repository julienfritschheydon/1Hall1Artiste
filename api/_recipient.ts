// Destinataire d'un e-mail : normalisation et garde-fou.
//
// EmailJS rejette tout envoi sans destinataire avec « The recipients address is
// empty ». Ces rejets consomment le quota du compte (3 tentatives par envoi) et
// noient les vrais échecs dans le tableau de bord. Une inscription sans e-mail
// exploitable (champ vide, espaces seuls, valeur perdue en base) doit donc être
// détectée ici, avant l'appel réseau.

/**
 * Renvoie l'adresse nettoyée, ou `null` si elle est inutilisable.
 * Aucune validation de format : seul le vide est bloquant, EmailJS et le SMTP
 * restant juges du reste.
 */
export function normalizeRecipient(to: unknown): string | null {
  if (typeof to !== "string") return null;
  const trimmed = to.trim();
  return trimmed === "" ? null : trimmed;
}
