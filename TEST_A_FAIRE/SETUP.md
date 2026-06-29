# Setup Visites Guidées — Étapes manuelles

## ⚠️ CRITIQUE — Variables d'env Vercel

Le code utilise les noms `VISIT_*`. Vercel a peut-être encore `DOODATES_*` (emails échouent sinon).
Vercel → Settings → Environment Variables :

```
VISIT_EMAILJS_TEMPLATE_IDS = {"confirmation":"template_q7nh8h2","reminder_7d":"template_q7nh8h2","reminder_1d_validate":"template_q7nh8h2","waitlist_confirmation":"template_q7nh8h2","waitlist_offer":"template_q7nh8h2","validation_expired":"template_q7nh8h2","cancellation":"template_q7nh8h2"}
VISIT_ALERT_EMAIL = julien.fritsch@gmail.com
PUBLIC_SITE_URL = https://www.1hall1artiste.fr
REGISTRATION_SECRET = (déjà présent)
CRON_SECRET = (déjà présent)
EMAILJS_SERVICE_ID / EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY / EMAILJS_TEMPLATE_ID = (déjà présents)
```

Supprimer les anciennes `DOODATES_EMAILJS_TEMPLATE_IDS` / `DOODATES_ALERT_EMAIL`.

---

## Firebase RTDB

Console Firebase → Realtime Database. Code guide test déjà créé :
```
guide_access_codes/
  test_code_1/
    code: "TESTGUIDE123"
    active: true
```
Les autres chemins (`tours`, `registrations`, `waitlist`, `attendance`, `visit_audit_logs`) se créent au premier POST.

---

## EmailJS — template `template_q7nh8h2` (nommé "Visites Notifications")

Le corps des emails est **construit dans le code** (`api/_visit-email.ts`), pas dans le template.
Le template est volontairement minimal :

- **To Email:** `{{to_email}}`
- **Subject:** `{{subject}}`
- **Content:** `{{{message}}}` ← **triple accolade** (rend le HTML : liens/boutons cliquables)
- From Name: `{{name}}` / Reply To: `{{email}}` (laisser tel quel)

⚠️ Ne PAS remettre de `{{#if type}}` — EmailJS/Handlebars ne sait pas comparer une valeur,
ça produit des emails vides. Tout le contenu (sujet + corps HTML FR) vient du code.

---

## .env.local (dev)

Déjà créé avec les bonnes valeurs (`VISIT_*`, `PUBLIC_SITE_URL`). Gitignoré.
