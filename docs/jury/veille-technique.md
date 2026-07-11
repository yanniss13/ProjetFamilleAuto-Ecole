# Veille technique (sources en anglais)

Date de rédaction : 2026-07-10. Toutes les sources ci-dessous sont
**officielles et en anglais** ; elles ont été consultées ce jour-là et les
faits relevés datent de cette consultation.

## Méthode de veille

- **Quoi** : les versions et annonces des briques du projet (Node.js,
  Express, Prisma) et la plateforme web en général (MDN).
- **Où** : uniquement les canaux officiels (pages de releases, documentation,
  changelogs GitHub) — pas de sources secondaires non vérifiées.
- **Quand** : au démarrage de chaque lot (les versions utilisées sont-elles
  toujours supportées ?) et avant toute montée de version (`npm outdated`,
  lecture du changelog avant `npm update`).
- **Comment trier** : une information n'est retenue que si elle a une
  implication concrète pour le projet (support LTS, breaking change,
  correctif de sécurité).

## Sources suivies et faits relevés le 2026-07-10

### Node.js — https://nodejs.org/en/about/previous-releases (anglais)

- **Fréquence** : à chaque lot + calendrier LTS deux fois par an.
- **Relevé du 2026-07-10** : v26 est « Current » ; les LTS actives sont
  **v24 « Krypton »** et **v22 « Jod »** ; v20 et v18 sont en fin de vie.
  La page rappelle que la production doit utiliser uniquement des versions
  LTS ; à partir de Node 27, le cycle deviendra annuel.
- **Implication pour MoniteurConnect** : le projet tourne sur **Node 22
  (LTS Jod)** — supporté ; la cible de production reste une LTS (22 ou 24).
  Le script de captures jury s'appuie d'ailleurs sur le WebSocket natif
  disponible depuis Node 22 (zéro dépendance ajoutée).

### Express — https://expressjs.com/ (anglais)

- **Fréquence** : à chaque lot touchant les routes/middlewares.
- **Relevé du 2026-07-10** : la version courante est **5.2.1** ; Express 5
  est la version stable documentée par défaut, avec un guide officiel
  « Moving to Express 5 ».
- **Implication** : le projet est **déjà sur Express 5** — les changements de
  la v5 (router réécrit, gestion des promesses rejetées dans les handlers,
  `req.query` non modifiable) sont absorbés depuis le squelette initial ;
  les contrôleurs async propagent leurs erreurs à Express sans wrapper.

### Prisma — https://github.com/prisma/prisma/releases (anglais)

- **Fréquence** : avant toute montée de version (`npm outdated` le signale).
- **Relevé du 2026-07-10** : dernière version **7.8.0** (22 avril 2026) —
  exemples de notes : option `queryPlanCacheMaxSize`, correctif d'un panic
  sur les filtres JSON PostgreSQL.
- **Implication** : cette veille a débouché sur une action datée — la
  **migration 6 → 7 a été réalisée le 2026-07-12** (guide officiel suivi :
  générateur `prisma-client` sans moteur Rust, adaptateur de driver
  `better-sqlite3`, `prisma.config.ts`, client généré chargé par le
  type-stripping natif de Node ≥ 22.18), validée par les 15 suites
  (448 assertions) rejouées après migration.

### MDN Web Docs — https://developer.mozilla.org/en-US/ (anglais)

- **Fréquence** : consultation au besoin (référence HTML/CSS/JS et
  compatibilité navigateurs), articles vedettes lors des passes de veille.
- **Relevé du 2026-07-10** : mise en avant de la documentation CSS/HTML/JS et
  d'articles sur des API web récentes (Navigation API, Trusted Types,
  positionnement par ancres CSS).
- **Implication** : MDN a servi de référence pour les jetons `autocomplete`
  valides (correction W3C du champ adresse), les attributs ARIA utilisés et
  les grilles CSS `auto-fit`/`minmax` du responsive.

## Niveau d'anglais mobilisé

Cette veille se fait en lisant la documentation technique en anglais
(pages de versions, guides de migration, cheat sheets — voir aussi
[`veille-securite.md`](veille-securite.md)) et en la restituant en français
dans les documents du projet : cela correspond à la compétence de
compréhension écrite de l'anglais technique attendue par le référentiel
(niveau B1 en compréhension, A2 à l'écrit).

## Synthèse pour le jury

Quatre sources officielles anglophones, chacune reliée à une décision réelle
du projet : rester sur une LTS Node (22), Express 5 déjà adopté et ses
breaking changes absorbés, **migration Prisma 7 réalisée le 2026-07-12**
(guide de mise à niveau suivi, suite complète rejouée), MDN comme référence
de conformité front. La veille n'est pas une liste de liens : chaque relevé
a une conséquence datée dans le dépôt.
