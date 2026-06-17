# Audit Spécifications vs Implémentation — Visites Guidées

Date: 2026-06-17
Référence: `docs/SPECS-visites-guidees.md`

Légende: ✅ Fait • ⚠️ Partiel • ❌ Manquant

---

## §1 Authentification & Accès
| Item | Statut | Note |
|---|---|---|
| Code accès guide | ✅ | `x-guide-code` header, validé RTDB `guide_access_codes` |
| Tous guides → toutes visites | ✅ | `guideId: 'all-guides'` |
| Renouvellement annuel | ⚠️ | Champ `renewalDate` existe, mais validation ne vérifie PAS l'expiration (seulement `active`). Révocation manuelle via `rtdbGuideCodeRevoke`. |

## §2 Interface Guide
| Item | Statut | Note |
|---|---|---|
| Création visite (tous champs) | ✅ | Formulaire `TourForm` |
| Modifier visite (avant J-1) | ✅ | Bouton Modifier, règle J-1 côté serveur |
| Dashboard liste + état | ✅ | `GuideToursList` |
| Nb inscrits / capacité | ✅ | Stats |
| Nb file d'attente | ✅ | Onglet File d'attente |
| Voir inscrits + file (listes séparées) | ✅ | Onglets séparés |
| Faire l'appel présent/absent | ✅ | `TourAttendanceSheet` |
| Inscription manuelle sur place | ✅ | `manual: true` → confirmé direct, sans email |
| Export CSV | ✅ | `exportCSV` |
| Export PDF | ⚠️ | Via `window.print()` (pas de génération PDF dédiée, pas de CSS print → imprime toute la page) |
| Imprimer liste présences | ⚠️ | Idem (print navigateur, pas de feuille dédiée) |

## §3 Inscriptions Publiques
| Item | Statut | Note |
|---|---|---|
| Section visites dans programme | ✅ | Bannière `/reservations` ajoutée dans Program |
| Affichage détails + places restantes | ✅ | `TourDetail` |
| Formulaire inscription | ✅ | nom, prénom, email |
| +1 accompagnant | ⚠️ | Champ prénom accompagnant uniquement dans le form public (pas nom accompagnant) |
| Email confirmation + lien validation 24H | ✅ | `confirmation` |
| Si complet → file d'attente | ✅ | Auto |
| Max 3 visites/personne | ✅ | `rtdbCountUserTours` |

## §3 Validation 24H
| Item | Statut | Note |
|---|---|---|
| Lien valide inscription | ✅ | `/reservations/confirm?token=` |
| Passé 24H → email expiration + suppression | ⚠️ | Email expiration envoyé. Suppression auto via cron `send-1d-validation` (auto-cancel deadline). PAS de cron dédié "purge attente_validation > 24H" hors fenêtre J-1. |

## §4 File d'Attente
| Item | Statut | Note |
|---|---|---|
| Email auto place libérée (24H) | ✅ | Cron `promote-waitlist` |
| Lien inscription 24H | ✅ | `/reservations/accept-waitlist?token=` |
| Passé 24H → suivant (boucle) | ✅ | Q5 auto-reject + next cron run |
| Annulation file d'attente | ✅ | `/reservations/cancel-waitlist?id=` |

## §5 Annulation Inscriptions
| Item | Statut | Note |
|---|---|---|
| User annule son inscription | ✅ | `/reservations/cancel?id=` + confirmation email |
| Avant J-1 → place va à file d'attente | ✅ | status annulé → cron `promote-waitlist` prévient 1er |
| Statuts inscription | ✅ | attente_validation → confirmé → présent/absent/annulé |

## §6 Emails
| Email | Statut | Note |
|---|---|---|
| Confirmation inscription | ✅ | + cancelLink ajouté |
| Validation expirée | ✅ | |
| Rappel 7j | ✅ | Cron |
| Rappel 1j + confirmation 24H | ✅ | Cron + auto-cancel |
| File d'attente place libérée | ✅ | Cron |
| Annulation (à user) | ✅ | `cancellation` |
| Annulation → prévenir file | ✅ | Via promote-waitlist |
| Suppression RGPD (1j après) | ⚠️ | Données supprimées (cron batch-delete) mais PAS d'email "données supprimées" envoyé (l'email arriverait après suppression — choix design, voir spec note) |
| **`{{type}}` passé au template** | ✅ | **CORRIGÉ** — was missing, conditional template now works |

## §7 RGPD
| Item | Statut | Note |
|---|---|---|
| Suppression auto 24H après visite | ✅ | Cron `batch-delete-post-tour` |
| Soft delete + audit logs | ✅ | `deletedAt` + `visit_audit_logs` |
| Droit à l'oubli (self-service) | ✅ | `/reservations/gdpr` — supprime inscriptions + file par email |
| Logs trace suppression | ✅ | `gdpr_request` audit log |

## §9 Cas Limites
| Item | Statut | Note |
|---|---|---|
| Email = clé dédup | ✅ | |
| Max 2 places/inscription | ⚠️ | Companion supporté mais pas strictement limité à 2 |
| Max 3 visites/personne | ✅ | |
| Réinscription après cancel | ✅ | count ignore annulés |
| **Guide réduit capacité → surplus en file** | ❌ | Edit tour ne déplace PAS les surnuméraires en file d'attente |
| **Guide augmente capacité → email file** | ❌ | Pas d'email auto aux premiers en queue |
| Coordonnées GPS invalides | ✅ | Bounds [-90,90]/[-180,180] |

---

## 🔴 Bugs corrigés ce jour
1. **Env var mismatch** : code utilisait `VISIT_EMAILJS_TEMPLATE_IDS`/`VISIT_ALERT_EMAIL` mais Vercel avait `DOODATES_*` → emails échouaient silencieusement. **Action requise : renommer les vars Vercel** (voir SETUP.md).
2. **Liens email cassés** : utilisaient `/reservations/...` au lieu de `/#/reservations/...` (HashRouter) + `VERCEL_URL` aléatoire au lieu du domaine. → Corrigé avec `PUBLIC_SITE_URL`.
3. **`{{type}}` non transmis** au template EmailJS → contenu conditionnel ne marchait pas. Corrigé.
4. **Routes `/confirm` `/activate`** : routées par path (fragile sur Vercel) → ajout `?action=`.

## ❌ Reste à faire (hors MVP §11)
| Item | Priorité | Effort |
|---|---|---|
| Capacité réduite → surplus auto en file | Moyenne | Moyen (logique edit tour) |
| Capacité augmentée → email premiers en file | Basse | Moyen |
| Email "données supprimées" RGPD | Basse | Faible |
| Nom accompagnant dans form public | Basse | Faible |
| Expiration code guide (renewalDate vérifié) | Basse | Faible |
| CSS print dédié feuille présences | Basse | Faible |
| Validation renewalDate code guide | Basse | Faible |

## ✅ MVP §11 — Statut: COMPLET
- ✅ Création visite
- ✅ Inscription + validation email
- ✅ File d'attente + email libération
- ✅ Appel présence
- ✅ Suppression auto 24H
- ✅ Export CSV (PDF via print)
- ✅ Lien annulation file d'attente
