// Alertes e-mail administrateur.
//
// Les erreurs serveur des routes api/ ne se voyaient que dans les logs Vercel :
// personne ne les regarde, et une inscription perdue un samedi de festival ne
// se rattrape pas le lundi. Chaque erreur 500 envoie donc un e-mail à
// l'administrateur avec le contexte de l'action (route, action, identifiants,
// message d'erreur, horodatage) pour qu'il puisse reprendre la main à la main.
//
// Deux garde-fous :
// - best-effort : un échec d'envoi ne doit jamais faire échouer la requête en
//   cours, ni masquer l'erreur d'origine ;
// - anti-rafale : une même action en erreur n'alerte qu'une fois par fenêtre,
//   sinon une panne EmailJS ou Firebase noierait la boîte de réception.
import type { VercelRequest } from "@vercel/node";
import { normalizeRecipient } from "./_recipient.js";

// Adresse par défaut : le projet n'a qu'un administrateur. VISIT_ALERT_EMAIL
// reste prioritaire pour rediriger les alertes sans redéployer.
const DEFAULT_ALERT_EMAIL = "julien.fritsch@gmail.com";

export function alertRecipient(): string {
  // VISIT_ALERT_EMAIL défini mais vide (cas classique d'une variable Vercel
  // effacée sans être supprimée) ferait partir l'alerte sans destinataire.
  return normalizeRecipient(process.env.VISIT_ALERT_EMAIL) || DEFAULT_ALERT_EMAIL;
}

// Fenêtre anti-rafale, par clé d'alerte (route + action + type d'erreur).
const THROTTLE_MS = 5 * 60 * 1000;
const lastSentAt = new Map<string, number>();

export function resetAlertThrottle(): void {
  lastSentAt.clear();
}

function shouldSend(key: string, now: number): boolean {
  const previous = lastSentAt.get(key);
  if (previous != null && now - previous < THROTTLE_MS) return false;
  lastSentAt.set(key, now);
  // Purge opportuniste : la lambda est réutilisée entre requêtes.
  for (const [k, t] of lastSentAt) {
    if (now - t > THROTTLE_MS) lastSentAt.delete(k);
  }
  return true;
}

/**
 * Envoi brut d'une alerte à l'administrateur. Best-effort, ne lève jamais.
 */
export async function sendAdminAlert(subject: string, message: string): Promise<void> {
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: alertRecipient(),
          subject,
          message,
        },
      }),
    });
  } catch (e) {
    console.error("[alert-email] Envoi de l'alerte administrateur impossible :", e);
  }
}

export type ApiErrorContext = {
  /** Route concernée, ex. « visit-register ». */
  route: string;
  /** Action métier en cours, ex. « confirm », « cancel », « create ». */
  action?: string;
  /** L'erreur levée (Error, string, inconnu). */
  error: unknown;
  /** Requête d'origine : méthode, chemin et identifiants utiles en sont extraits. */
  req?: Pick<VercelRequest, "method" | "url" | "query" | "body">;
  /** Contexte métier supplémentaire (identifiants d'inscription, de visite, email…). */
  details?: Record<string, unknown>;
};

// Les champs repris de la requête : identifiants utiles au diagnostic, à
// l'exclusion de tout ce qui pourrait transporter un secret.
const SAFE_KEYS = [
  "id",
  "action",
  "type",
  "tourId",
  "registrationId",
  "waitlistId",
  "email",
  "deviceId",
];
const SECRET_KEY_RE = /token|secret|password|code|authorization|key/i;

function collectSafeFields(source: unknown): Record<string, unknown> {
  if (!source || typeof source !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) continue;
    if (!SAFE_KEYS.includes(k)) continue;
    if (v == null || typeof v === "object") continue;
    out[k] = v;
  }
  return out;
}

function describeError(error: unknown): { summary: string; stack?: string } {
  if (error instanceof Error) {
    return { summary: `${error.name}: ${error.message}`, stack: error.stack };
  }
  return { summary: String(error) };
}

export function buildApiErrorMessage(ctx: ApiErrorContext, now: Date = new Date()): string {
  const { summary, stack } = describeError(ctx.error);
  const fields = {
    ...collectSafeFields(ctx.req?.query),
    ...collectSafeFields(ctx.req?.body),
    ...(ctx.details ?? {}),
  };

  const lines = [
    `Une erreur serveur est survenue sur l'API DooDates.`,
    ``,
    `Route      : /api/${ctx.route}`,
    `Action     : ${ctx.action || "(non précisée)"}`,
    `Méthode    : ${ctx.req?.method || "(inconnue)"}`,
    `URL        : ${ctx.req?.url || "(inconnue)"}`,
    `Horodatage : ${now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (Europe/Paris)`,
    ``,
    `Erreur : ${summary}`,
  ];

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length > 0) {
    lines.push(``, `Contexte de l'action :`);
    for (const [k, v] of entries) lines.push(`  - ${k} : ${String(v)}`);
  }

  if (stack) {
    lines.push(``, `Trace :`, stack.split("\n").slice(0, 12).join("\n"));
  }

  return lines.join("\n");
}

/**
 * Alerte l'administrateur d'une erreur serveur, avec le contexte de l'action.
 * Best-effort : ne lève jamais, et se tait si la même action a déjà alerté
 * dans les cinq dernières minutes.
 */
export async function alertApiError(ctx: ApiErrorContext): Promise<void> {
  try {
    const { summary } = describeError(ctx.error);
    const key = `${ctx.route}|${ctx.action || ""}|${summary}`;
    if (!shouldSend(key, Date.now())) return;

    const subject = `DooDates — erreur API /${ctx.route}${ctx.action ? ` (${ctx.action})` : ""}`;
    await sendAdminAlert(subject, buildApiErrorMessage(ctx));
  } catch (e) {
    console.error("[alert-email] Alerte d'erreur API impossible :", e);
  }
}
