// Construction du contenu des emails visites guidées.
// EmailJS/Handlebars ne sait pas comparer ({{#if type "x"}} ne marche pas) → on
// construit sujet + corps HTML ICI. Le template n'affiche que {{subject}} et {{{message}}}
// (triple accolade = HTML non échappé, pour des liens cliquables).

export type VisitEmailType =
  | "confirmation"
  | "registration_confirmed"
  | "reminder_7d"
  | "reminder_1d_validate"
  | "waitlist_confirmation"
  | "waitlist_offer"
  | "waitlist_offer_expired"
  | "validation_expired"
  | "cancellation"
  | "waitlist_accepted"
  | "waitlist_left"
  | "gdpr_confirm"
  | "error";

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)
  );
}

function btn(url: string, label: string): string {
  return `<p><a href="${esc(url)}" style="display:inline-block;background:#ff7a45;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(
    label
  )}</a></p>`;
}

function wrap(paragraphs: string): string {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#1a2138">${paragraphs}<p style="color:#888;font-size:13px;margin-top:24px">Collectif Île Feydeau</p></div>`;
}

export function buildVisitEmail(
  type: VisitEmailType,
  d: Record<string, any>
): { subject: string; message: string } {
  const title = esc(d.tourTitle || "votre visite");
  const date = d.tourDate ? esc(formatDate(d.tourDate)) : "";
  const hi = d.firstName
    ? `<p>Bonjour ${esc(d.firstName)},</p>`
    : `<p>Bonjour,</p>`;

  switch (type) {
    case "confirmation":
      return {
        subject: `Une dernière étape — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}
          <p>Votre demande d'inscription à « ${title} »${date ? ` le ${date}` : ""} est bien reçue, mais <strong>ce n'est pas encore terminé</strong>.</p>
          <p><strong>Cliquez ci-dessous pour valider définitivement votre inscription</strong> (obligatoire, sous 24h) :</p>
          ${btn(d.validationLink, "Valider mon inscription")}
          <p style="color:#888;font-size:13px">Sans validation sous 24h, l'inscription sera annulée. Vous recevrez un second email avec tous les détails (horaire, lieu, ajout au calendrier) une fois la validation faite.</p>
          ${d.cancelLink ? `<p style="font-size:13px"><a href="${esc(d.cancelLink)}">Annuler mon inscription</a></p>` : ""}`
        ),
      };

    case "registration_confirmed": {
      const details = `
        <ul style="padding-left:18px">
          <li><strong>Visite :</strong> ${title}</li>
          ${date ? `<li><strong>Date et heure :</strong> ${date}</li>` : ""}
          ${d.durationMinutes ? `<li><strong>Durée :</strong> environ ${esc(d.durationMinutes)} min</li>` : ""}
          ${d.location ? `<li><strong>Lieu de rendez-vous :</strong> ${esc(d.location)}</li>` : ""}
        </ul>`;
      return {
        subject: `C'est confirmé — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}
          <p>Votre inscription à « ${title} » est <strong>définitivement confirmée</strong>. Voici les détails :</p>
          ${details}
          ${d.icsUrl ? btn(d.icsUrl, "Ajouter à mon calendrier (.ics)") : ""}
          ${d.googleCalUrl ? `<p style="font-size:13px"><a href="${esc(d.googleCalUrl)}">Ou ajouter à Google Calendar</a></p>` : ""}
          <p>À bientôt sur l'Île Feydeau !</p>
          ${d.cancelLink ? `<p style="font-size:13px"><a href="${esc(d.cancelLink)}">Annuler mon inscription</a></p>` : ""}`
        ),
      };
    }

    case "reminder_7d":
      return {
        subject: `Rappel — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>Petit rappel : vous êtes inscrit(e) à « ${title} »${date ? ` le ${date}` : ""}.</p><p>À bientôt !</p>`
        ),
      };

    case "reminder_1d_validate":
      return {
        subject: `Confirmez votre présence — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}
          <p>Votre visite « ${title} » approche. Merci de <strong>confirmer votre présence</strong>${
            d.deadline ? ` avant le ${esc(formatDate(d.deadline))}` : ""
          }, sinon votre place sera libérée :</p>
          ${btn(d.validationLink, "Confirmer ma présence")}`
        ),
      };

    case "waitlist_confirmation":
      return {
        subject: `File d'attente — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}
          <p>La visite « ${title} » est complète. Vous êtes en file d'attente${
            d.position ? ` (position #${esc(d.position)})` : ""
          }.</p>
          <p>Vous recevrez un email si une place se libère.</p>
          ${d.queueLink ? `<p style="font-size:13px"><a href="${esc(d.queueLink)}">Quitter la file d'attente</a></p>` : ""}`
        ),
      };

    case "waitlist_offer":
      return {
        subject: `Une place s'est libérée — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}
          <p><strong>Bonne nouvelle !</strong> Une place s'est libérée pour « ${title} ».</p>
          <p>Pour l'accepter${d.deadline ? ` avant le ${esc(formatDate(d.deadline))}` : ""} :</p>
          ${btn(d.acceptLink, "Accepter ma place")}
          <p style="color:#888;font-size:13px">Passé ce délai, la place sera proposée à la personne suivante.</p>`
        ),
      };

    case "waitlist_offer_expired":
      return {
        subject: `Place non confirmée à temps — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>La place proposée pour « ${title} » n'a pas été confirmée dans le délai imparti (24h) et a été proposée à la personne suivante en file d'attente.</p><p>Vous pouvez vous réinscrire en file d'attente si des places sont disponibles.</p>`
        ),
      };

    case "validation_expired":
      return {
        subject: `Lien expiré — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>Votre lien de validation pour « ${title} » a expiré et l'inscription a été annulée.</p><p>Vous pouvez vous réinscrire si des places sont disponibles.</p>`
        ),
      };

    case "cancellation":
      return {
        subject: `Annulation — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>Votre inscription à « ${title} »${date ? ` le ${date}` : ""} a bien été annulée.</p><p>À une prochaine fois !</p>`
        ),
      };

    case "waitlist_accepted":
      return {
        subject: `Place confirmée — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>Votre place pour « ${title} »${date ? ` le ${date}` : ""} est confirmée.</p>
          ${d.location ? `<p><strong>Lieu de rendez-vous :</strong> ${esc(d.location)}</p>` : ""}
          ${d.icsUrl ? btn(d.icsUrl, "Ajouter à mon calendrier (.ics)") : ""}
          ${d.googleCalUrl ? `<p style="font-size:13px"><a href="${esc(d.googleCalUrl)}">Ou ajouter à Google Calendar</a></p>` : ""}
          <p>À bientôt !</p>`
        ),
      };

    case "waitlist_left":
      return {
        subject: `File d'attente quittée — ${d.tourTitle || "votre visite"}`,
        message: wrap(
          `${hi}<p>Vous avez été retiré(e) de la file d'attente pour « ${title} ».</p>`
        ),
      };

    case "gdpr_confirm":
      return {
        subject: "Confirmez la suppression de vos données — Visites guidées",
        message: wrap(
          `${hi}
          <p>Vous avez demandé la suppression de toutes vos données (inscriptions et file d'attente) pour les visites guidées de l'Île Feydeau.</p>
          <p>Pour confirmer (lien valable 24h) :</p>
          ${btn(d.confirmLink, "Supprimer mes données")}
          <p style="color:#888;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — rien ne sera supprimé.</p>`
        ),
      };

    case "error":
      return {
        subject: `Erreur application Collectif Feydeau`,
        message: wrap(`<p>${esc(d.errorMessage || "Une erreur est survenue.")}</p><p>${esc(d.errorDetails || "")}</p>`),
      };
  }
}

function formatDate(iso: string): string {
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    // timeZone explicite : les fonctions Vercel tournent en UTC — sans elle,
    // une visite à 14h (Paris) s'affichait « 12:00 » dans tous les emails.
    return dt.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
  } catch {
    return iso;
  }
}
