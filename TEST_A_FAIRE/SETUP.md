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

## EmailJS — template `template_q7nh8h2`

- **To Email:** `{{to_email}}`
- **Subject:** `{{type}}: {{tourTitle}}`
- **Body:** blocs conditionnels `{{#if type "..."}}` pour : confirmation, reminder_7d,
  reminder_1d_validate, waitlist_confirmation, waitlist_offer, validation_expired,
  cancellation, error. Variables : `{{firstName}}`, `{{tourTitle}}`, `{{tourDate}}`,
  `{{validationLink}}`, `{{cancelLink}}`, `{{acceptLink}}`, `{{queueLink}}`,
  `{{deadline}}`, `{{position}}`, `{{errorMessage}}`, `{{errorDetails}}`.

---

## .env.local (dev)

Déjà créé avec les bonnes valeurs (`VISIT_*`, `PUBLIC_SITE_URL`). Gitignoré.
