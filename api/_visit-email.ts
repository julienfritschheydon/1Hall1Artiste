// Construction du contenu des emails visites guidées.
// EmailJS/Handlebars ne sait pas comparer ({{#if type "x"}} ne marche pas) → on
// construit sujet + corps ICI et le template n'affiche que {{subject}} / {{message}}.

export type VisitEmailType =
  | "confirmation"
  | "reminder_7d"
  | "reminder_1d_validate"
  | "waitlist_confirmation"
  | "waitlist_offer"
  | "validation_expired"
  | "cancellation"
  | "error";

export function buildVisitEmail(
  type: VisitEmailType,
  d: Record<string, any>
): { subject: string; message: string } {
  const title = d.tourTitle || "votre visite";
  const date = d.tourDate ? formatDate(d.tourDate) : "";
  const hello = `Bonjour ${d.firstName || ""},`.trim();

  switch (type) {
    case "confirmation":
      return {
        subject: `Confirmation — ${title}`,
        message: `${hello}

Votre inscription à « ${title} »${date ? ` le ${date}` : ""} est bien enregistrée.

Pour la VALIDER (obligatoire, sous 24h), cliquez ici :
${d.validationLink}

Sans validation sous 24h, l'inscription sera annulée.

Pour annuler votre inscription :
${d.cancelLink}

À bientôt !
Collectif Île Feydeau`,
      };

    case "reminder_7d":
      return {
        subject: `Rappel — ${title}`,
        message: `${hello}

Petit rappel : vous êtes inscrit(e) à « ${title} »${date ? ` le ${date}` : ""}.

À bientôt !
Collectif Île Feydeau`,
      };

    case "reminder_1d_validate":
      return {
        subject: `Confirmez votre présence — ${title}`,
        message: `${hello}

Votre visite « ${title} » approche. Merci de CONFIRMER votre présence${
          d.deadline ? ` avant le ${formatDate(d.deadline)}` : ""
        }, sinon votre place sera libérée :
${d.validationLink}

Collectif Île Feydeau`,
      };

    case "waitlist_confirmation":
      return {
        subject: `File d'attente — ${title}`,
        message: `${hello}

La visite « ${title} » est complète. Vous êtes en file d'attente${
          d.position ? ` (position #${d.position})` : ""
        }.

Vous recevrez un email si une place se libère.

Pour quitter la file d'attente :
${d.queueLink}

Collectif Île Feydeau`,
      };

    case "waitlist_offer":
      return {
        subject: `Une place s'est libérée — ${title}`,
        message: `${hello}

Bonne nouvelle ! Une place s'est libérée pour « ${title} ».

Pour l'accepter${d.deadline ? ` avant le ${formatDate(d.deadline)}` : ""}, cliquez ici :
${d.acceptLink}

Passé ce délai, la place sera proposée à la personne suivante.

Collectif Île Feydeau`,
      };

    case "validation_expired":
      return {
        subject: `Lien expiré — ${title}`,
        message: `${hello}

Votre lien de validation pour « ${title} » a expiré et l'inscription a été annulée.

Vous pouvez vous réinscrire si des places sont disponibles.

Collectif Île Feydeau`,
      };

    case "cancellation":
      return {
        subject: `Annulation — ${title}`,
        message: `${hello}

Votre inscription à « ${title} »${date ? ` le ${date}` : ""} a bien été annulée.

À une prochaine fois !
Collectif Île Feydeau`,
      };

    case "error":
      return {
        subject: `Erreur application Collectif Feydeau`,
        message: `${d.errorMessage || "Une erreur est survenue."}\n\n${d.errorDetails || ""}`,
      };
  }
}

function formatDate(iso: string): string {
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
