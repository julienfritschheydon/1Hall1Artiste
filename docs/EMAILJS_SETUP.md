# EmailJS Configuration

> **À jour du code** : les conditions `{{#if type "…"}}` décrites plus bas ne
> fonctionnent pas (Handlebars ne compare pas deux valeurs). Le sujet et le corps
> HTML sont construits dans [api/_visit-email.ts](../api/_visit-email.ts), et le
> template EmailJS n'affiche plus que `{{subject}}` et `{{{message}}}` (triple
> accolade = HTML non échappé, pour des liens cliquables). Les seuls
> `template_params` envoyés sont `to_email`, `subject`, `message`, `firstName`,
> **identiques pour tous les types d'email** : les templates sont donc
> interchangeables, et `resolveTemplateId()` retombe sur n'importe quel ID
> configuré quand un type n'a pas d'entrée dédiée dans
> `VISIT_EMAILJS_TEMPLATE_IDS`. La section « Required Variables » ci-dessous est
> conservée à titre historique.

## Template: Visites Notifications

**Template ID**: From VISIT_EMAILJS_TEMPLATE_IDS.confirmation

### Required Variables

All variables must be provided to avoid "One or more dynamic variables are corrupted" error.

#### Always required:
- `to_email` — recipient email address
- `firstName` — participant first name
- `type` — email type (confirmation, waitlist_confirmation, validation_expired, cancellation)
- `tourTitle` — tour name
- `tourDate` — tour date

#### Conditional (based on email type):
- **confirmation**: `validationLink`, `cancelLink`
- **waitlist_confirmation**: `position`, `deadline`, `acceptLink`, `queueLink`
- **validation_expired**: (basic fields only)
- **cancellation**: (basic fields only)
- **error handling**: `errorMessage`, `errorDetails`

### Template Conditions in EmailJS

The template uses conditional logic:
- `{{#if type "confirmation"}}` — show validation link
- `{{#if type "reminder_7d"}}` — show reminder text
- `{{#if type "waitlist_confirmation"}}` — show queue position
- `{{#if type "waitlist_offer"}}` — show acceptance link
- `{{#if type "validation_expired"}}` — show expiration message
- `{{#if type "error"}}` — show error details

### How to Fix "Corrupted Variables"

EmailJS marks a variable as corrupted if:
1. It's referenced in the template but not provided in the request
2. The value is `undefined` (send empty string `""` instead)
3. Conditional variables are missing when their condition triggers

**Solution**: Always provide ALL variables in template_params, even if empty:
```json
{
  "template_params": {
    "to_email": "...",
    "firstName": "...",
    "type": "confirmation",
    "tourTitle": "...",
    "tourDate": "...",
    "validationLink": "..." or "",
    "position": "" ,
    "deadline": "",
    "cancelLink": "...",
    "acceptLink": "",
    "queueLink": "",
    "errorMessage": "",
    "errorDetails": ""
  }
}
```

## API Authentication

EmailJS expects Private Key in request body as `accessToken` field:
```json
{
  "service_id": "service_xxx",
  "template_id": "template_xxx",
  "user_id": "PUBLIC_KEY",
  "accessToken": "PRIVATE_KEY",  // <-- Required in body, not header
  "template_params": { ... }
}
```

Do NOT use `X-Private-Key` header — it will fail with `403 API access in strict mode`.
