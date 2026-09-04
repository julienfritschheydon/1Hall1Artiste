# Authentification admin

## Ce qui a changé, et pourquoi

Jusqu'ici l'accès admin reposait sur une constante du code client :

```ts
// src/components/AdminLogin.tsx — AVANT
const ADMIN_PIN = '<4 chiffres, en dur>';
```

Vite compile cette constante dans le bundle servi à **tous** les visiteurs : le code
était lisible dans `dist/assets/Admin-*.js`. Corollaire direct, `POST /api/artist-update`
acceptait n'importe quel `{ artistId, fields }` sans vérification serveur — n'importe qui
pouvait écraser la fiche de n'importe quel artiste avec un simple `curl`.

Désormais :

- le mot de passe vit dans la variable d'environnement `ADMIN_PASSWORD`, côté serveur
  uniquement ;
- `POST /api/artist-link { action: "admin-login", password }` le vérifie et renvoie un
  **token signé** (HMAC, 8 h) ;
- les routes admin exigent ce token, vérifié côté serveur à chaque appel.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `ADMIN_PASSWORD` | Le mot de passe saisi dans l'écran d'administration. |
| `ADMIN_SECRET` | Clé de signature HMAC des tokens admin. Chaîne longue et aléatoire, sans rapport avec `ADMIN_PASSWORD`. |
| `ARTIST_SECRET` | Préexistante. Signe les tokens **artiste** — donc nécessaire à la génération de lien, même quand l'authentification admin est correctement configurée. |

Les trois sont à définir dans Vercel (Project → Settings → Environment Variables), pour
Production **et** Preview. Si `ADMIN_PASSWORD` est absent, la connexion répond 500 : une
configuration incomplète ferme la porte, elle ne l'ouvre jamais.

Changer `ADMIN_SECRET` invalide immédiatement toutes les sessions admin en cours.

Piège rencontré en preview : l'authentification admin peut fonctionner pendant que la
génération de lien échoue, parce qu'elles ne dépendent pas des mêmes variables. Se
connecter n'atteste que d'`ADMIN_PASSWORD` et `ADMIN_SECRET` ; le bouton « Lien d'édition »
exige en plus `ARTIST_SECRET`, qui n'est pas toujours définie sur Preview alors qu'elle
l'est en Production. Donner la même valeur des deux côtés garde les liens valides partout.

## Sur la robustesse

- La connexion est limitée à 10 tentatives par minute et par IP. Comme pour
  `api/favorites`, ce compteur est **par instance serverless** : c'est un garde-fou, pas
  une protection contre un forçage distribué.
- Le formulaire accepte jusqu'à 128 caractères : une vraie phrase de passe passe sans
  problème. Un code court resterait forçable malgré le rate limit — autant profiter de la
  place.
- La comparaison porte sur des empreintes SHA-256 des deux valeurs, à durée constante.
  Comparer les chaînes brutes aurait obligé à sortir plus tôt quand les longueurs
  diffèrent, ce qui révélait la taille du mot de passe.

Vu ce que protège cette interface — le contenu éditorial des fiches artistes, pas des
données personnelles sensibles — ce niveau est proportionné. Il ne le serait plus si
l'admin donnait un jour accès aux inscriptions ou aux coordonnées des visiteurs.

## Pourquoi le login vit dans `/api/artist-link`

Le plan Vercel Hobby refuse un déploiement au-delà de **12 fonctions serverless**, et le
projet est exactement à la limite. Une route `api/admin-login.ts` dédiée en aurait fait 13
et cassait le déploiement — ce qui est arrivé une fois.

Les actions admin sont donc multiplexées dans `/api/artist-link`, sur le modèle de
`/api/visit-emails?type=…`. Le test `src/services/vercelFunctionBudget.test.ts` échoue si
`api/` repasse au-dessus de 12 routes : `npm run build` ne compile que le front, il ne
peut pas détecter ce dépassement.

## Générer le lien d'édition d'un artiste

L'écran Artistes de l'admin propose un bouton **« Lien d'édition »** par fiche. Il appelle
`POST /api/artist-link { adminToken, artistId }`, qui renvoie le lien **directement dans la
réponse** — aucun email n'est envoyé.

Le lien émis est exactement celui que l'artiste recevrait : il est rattaché à son adresse
et couvre **toutes** ses fiches. Pour une adresse inscrite plusieurs fois (Chorale Label
Diva, John Do), le portail affichera donc des onglets.

Deux usages :

- **dépannage** — un artiste ne reçoit pas ses emails : on lui transmet le lien par SMS
  ou WhatsApp ;
- **test** — vérifier le portail sans écrire dans la boîte d'un artiste réel.

Ce lien vaut 30 jours et permet de modifier la fiche **au nom de l'artiste**. Il ne se
diffuse qu'à l'intéressé.
