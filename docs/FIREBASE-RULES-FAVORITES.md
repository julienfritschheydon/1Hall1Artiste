# Règles RTDB pour la sync des favoris

## ⚠️ À faire dans la console Firebase AVANT d'annoncer la récupération par email

Les chemins `user-favorites` et `favorites-email-index` contiennent des emails en clair.
Les règles RTDB actuelles du projet vivent **uniquement dans la console** (non versionnées) —
ne JAMAIS déployer un fichier `database.rules.json` partiel : cela écraserait l'intégralité
du ruleset (likes, tours, registrations, community cassés en production).

## Procédure

1. Console Firebase → Realtime Database → Règles.
2. **Vérifier la cascade `.read`** : en RTDB, une règle `.read: true` sur un ancêtre ne peut
   PAS être révoquée par un `.read: false` enfant. Si la racine (ou un parent) a `.read: true`,
   il faut restructurer les règles par branche (donner `.read: true` explicitement à chaque
   branche publique : `likes-data`, `likes-stats`, `community-photos`, etc.) et laisser le
   défaut à `false`.
3. Ajouter (ou vérifier) ces deux blocs — toutes les lectures/écritures passent par
   `/api/favorites` avec le secret admin, donc tout à `false` :

```json
{
  "rules": {
    "user-favorites": {
      ".read": false,
      ".write": false
    },
    "favorites-email-index": {
      ".read": false,
      ".write": false
    }
  }
}
```

(Bloc à FUSIONNER dans le ruleset existant de la console, pas à coller tel quel.)

## Maintenance

- Purge annuelle post-festival des nœuds orphelins (navigation privée → deviceIds jetables) :
  supprimer les `user-favorites/{id}` **sans champ `email`** dont `updatedAt` date de plus de
  ~6 mois. Ne jamais purger les nœuds avec email.
- `updatedAt` sert uniquement à l'audit et à cette purge — aucune logique de résolution de
  conflit ne s'appuie dessus.

## Risques résiduels acceptés (documentés dans le plan)

- Écriture non authentifiée sur un deviceId connu : les deviceIds sont des UUID jamais
  publiés en lecture publique (contrairement aux sessionIds likes exposés dans `likedBy`).
- Récupération par email : « le secret est l'email » — quiconque connaît un email peut lire
  et polluer les favoris associés. Proportionné à la sensibilité (favoris de festival).
- Rate limit `/api/favorites` : best-effort par instance serverless uniquement.
