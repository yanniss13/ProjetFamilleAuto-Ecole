# Script de soutenance — design

Date : 2026-07-10
Statut : validé, prêt pour plan d'implémentation.

## Contexte

Dernier chantier de préparation jury (après « consolidation du dossier » et
« conformité visible », livrés le 2026-07-10). L'audit est à 22 validés /
10 à renforcer / 1 manquant (veille technique anglophone). Ce chantier produit
le matériel de soutenance (35 min + démo 11 min + 45 min de questions), les
deux veilles, et solde les contradictions documentaires restantes
(`README.md`, `docs/DESIGN.md`).

## Décisions validées

1. **Support = deck HTML autonome** (un seul fichier, CSS/JS embarqués — hors
   application, pas de contrainte CSP), pas de PowerPoint ni de dépendance.
2. **DESIGN.md classé en historique** : déplacé vers
   `docs/historique/2026-06/DESIGN.md` avec bandeau, liens mis à jour — pas de
   réécriture rétrospective.
3. **Micro-fix Mailpit en TDD** : `mailer.js` ne passe `auth` à Nodemailer que
   si `SMTP_USER` est défini.
4. **Veilles sourcées en ligne** : les URLs et dates des sources anglophones
   sont vérifiées au moment de la rédaction (WebFetch/WebSearch), jamais de
   mémoire.
5. **Passation Codex** : à chaque tâche — plan coché + checkpoint
   `docs/jury/README.md` + commit.

## Branche et conventions

- Branche `jury-script-soutenance` depuis `main` ; commits `Jury: ...`.
- `npm test` avant chaque commit ; jamais les fichiers personnels racine.
- Textes en français, typographie française.

## Livrables

### 1. `docs/jury/soutenance/soutenance.html` — deck des 35 minutes

Un fichier HTML autonome (~25-30 diapositives), structure = déroulé de
l'audit §4 :

| Minutage | Section |
|---|---|
| 0–3 | Problème, acteurs, besoin, proposition de valeur |
| 3–6 | Compétences, découpage, maquettes v1 → v2, charte |
| 6–10 | Architecture, technologies, environnements, méthode TDD |
| 10–14 | BDD : diagramme v2, contraintes, migrations |
| 14–25 | Démonstration (renvoi au script démo) |
| 25–31 | Focus code : signature électronique (6 min) |
| 31–34 | Sécurité, tests, conformité W3C/axe/responsive, veilles |
| 34–35 | Limites, production, conclusion |

Fonctions embarquées (JS vanilla inline, ~100 lignes) : navigation ←/→ et
clic, compteur `n/N`, **minutage cible de la section affiché en pied de
diapo**, **notes orateur** togglables à la touche `N` (masquées par défaut),
mode impression propre (`@media print` : une diapo par page) pour l'export
PDF de secours via Edge headless `--print-to-pdf`.

Contenu : réutilise les livrables existants par chemins relatifs — captures
(`../captures/…`), diagramme BDD (`../diagrammes/bdd-v2.png`), maquette v1
vs capture (comparaison), chiffres réels (15 suites/438 assertions,
0 erreur W3C, 0 violation axe, 22+ critères validés). Aucune image externe.

### 2. `docs/jury/soutenance/demo-11-minutes.md` — démo scénarisée

- **Préparation (la veille et le jour J)** : `npm run seed:demo`, serveur,
  Mailpit lancé (`SMTP_HOST=localhost`, `SMTP_PORT=1025` dans `.env`),
  onglets pré-ouverts dans l'ordre, comptes (école vitrine / admin), zoom
  navigateur, notifications OS coupées.
- **Déroulé minuté** (~11 min, marges incluses) : tableau étape par étape —
  minute, URL/onglet, action précise, phrase clé à dire, critère jury
  couvert. Parcours : recherche + carte → détail annonce (badge vérifié,
  localisation) → candidature (pièces) → email Mailpit + page de suivi →
  côté école : candidatures, acceptation avec signature au pad → invitation →
  contreseing candidat → PDF final signé (empreintes) → dashboard stats →
  admin (modération + purge RGPD en direct sur l'alerte antidatée).
- **Scénario de secours** : si le direct casse — captures 1440 px à montrer
  dans l'ordre du déroulé, dossier signé du seed (`/suivi/<token>` imprimé
  dans la sortie du seed), PDF signé téléchargeable.
- **Reset** : relancer `npm run seed:demo` (recrée l'alerte purgeable).

### 3. `docs/jury/soutenance/questions-reponses.md` — les 45 minutes

~30 questions anticipées, groupées par thème (sécurité ; BDD/Prisma ;
architecture/Express ; méthode/TDD ; RGPD ; front/accessibilité/responsive ;
production/déploiement ; choix technologiques et alternatives). Format par
question : **réponse courte** (2-4 phrases, honnête sur les limites) +
**preuve à montrer** (fichier, test, page, document jury). Inclut les
questions pièges connues : « pourquoi pas de framework front ? », « pourquoi
des sessions et pas du JWT ? », « votre app est-elle POO ? », « pourquoi
SQLite ? », « qu'est-ce qui manque pour la production ? », « les contrats
sont-ils juridiquement valables ? ».

### 4. `docs/jury/veille-securite.md`

Fiches « **menace → source (URL + date de consultation) → impact sur
MoniteurConnect → décision appliquée → preuve** » couvrant au minimum :
injection (Prisma paramétré + validation), XSS (Twig autoescape + CSP),
CSRF (jeton + multipart différé), uploads malveillants (magic bytes, stockage
privé), force brute / énumération (rate limiting, réponses neutres, dummy
hash), sessions (régénération, cookies, persistance), mots de passe (bcrypt),
données personnelles (purge RGPD). Sources de référence type OWASP
(Top 10 / Cheat Sheets) vérifiées en ligne. Conclut sur la méthode de veille
(où, quand, comment trier).

### 5. `docs/jury/veille-technique.md` — solde le dernier MANQUANT

Sources **officielles anglophones** vérifiées en ligne au moment de la
rédaction : Node.js (blog releases / calendrier LTS), Express (docs 5.x,
notes de migration), Prisma (releases/changelog), MDN, web.dev ou équivalent.
Pour chaque source : URL, langue, fréquence de consultation, un exemple
concret d'information récente et **ce qu'elle implique pour le projet**
(ex. : version LTS visée en production, breaking changes Express 5 déjà
absorbés, évolution Prisma). Synthèse rédigée en français ; mention du niveau
d'anglais mis en œuvre (critère B1/A2 du référentiel).

### 6. `README.md` du dépôt — réécrit

Sections : présentation réelle (2 paragraphes, renvoi vers
`docs/jury/resume-projet.md`), fonctionnalités livrées (liste courte),
installation (`npm install`, `.env` depuis `.env.example`, migrations),
commandes (`dev`, `test`, `seed:demo`, `admin:create`, `purge`), tests
(15 suites / 438 assertions), documentation (liens `docs/README.md` et
`docs/jury/README.md`), avertissement contrats indicatifs. Supprimer toute
formulation « squelette ».

### 7. `docs/DESIGN.md` → `docs/historique/2026-06/DESIGN.md`

Déplacement avec bandeau en tête : « Document de cadrage initial
(juin 2026), conservé comme preuve de conception — l'état actuel est décrit
dans docs/jury/ ». Mettre à jour les références : `docs/jury/README.md`
(« Spécification historique »), `docs/README.md`,
`docs/historique/2026-06/README.md` (l'y ajouter), et toute autre référence
trouvée par grep.

### 8. Micro-fix Mailpit (TDD)

`src/services/mailer.js` : le transport Nodemailer ne reçoit `auth` que si
`SMTP_USER` est défini (Mailpit et les relais locaux n'ont pas
d'authentification ; certains serveurs rejettent un bloc `auth` vide).
Test écrit d'abord dans `test/ameliorations.cjs` (section email existante,
pas de nouveau port) : transport construit sans `auth` quand `SMTP_USER`
est absent, avec `auth` quand il est défini. Aucun autre changement de
comportement.

### 9. Cohérence finale

- Audit : « Veille sécurité » À RENFORCER → VALIDÉ ; « Veille technique »
  MANQUANT → VALIDÉ ; revisiter les critères qui citaient README/DESIGN
  obsolètes (« Résumé du projet » : note d'action, « Cohérence entre
  spécifications et application finale ») ; synthèse recomptée ; cases P2
  cochées.
- `docs/jury/README.md` : soutenance/ et veilles indexées, checkpoint final
  du chantier (et de la préparation jury).
- `AGENTS.md` : « Prochain travail » → répétitions + checklist clavier +
  décision de push (plus de chantier documentaire planifié).

## Vérifications

- Deck : ouverture dans Edge headless + capture (contrôle visuel de 2-3
  diapositives), export PDF non vide, navigation testée via CDP
  (Runtime.evaluate des raccourcis).
- Démo : chaque URL du déroulé répond 200 sur le serveur seedé (contrôle
  scripté léger).
- Veilles : chaque URL citée répond (WebFetch) à la date indiquée.
- Micro-fix : test rouge puis vert ; `npm test` complet avant chaque commit.
- Liens Markdown relatifs : 0 cassé sur tous les fichiers touchés ;
  `npx prisma validate` en fin de chantier.

## Hors périmètre

- Enregistrement/répétition de l'oral (côté utilisateur).
- Traduction du deck ou support bilingue.
- Déploiement production réel (reste le seul grand chantier hors jury, avec
  la doc sauvegarde/restauration listée dans l'audit).
