# Corrections de l'audit jury - plan d'implementation

> **Pour les agents :** SOUS-COMPETENCE REQUISE : utiliser
> `superpowers:executing-plans` pour executer ce plan tache par tache. Le depot
> impose un seul agent a la fois ; ne pas deleguer et ne pas partager le staging.

**Objectif :** Corriger les preuves responsive et les incoherences documentaires
reperees lors de l'audit du 2026-07-10, sans modifier le comportement metier.

**Architecture :** Le script de capture conservera la taille de fenetre Edge pour
le confort, puis imposera le viewport exact avec CDP. La correction sera couverte
dans la suite existante `test/ameliorations.cjs`. Les documents jury seront ensuite
alignes sur les preuves fraiches, la realite des onze lots livres et une procedure
honnete de migration/sauvegarde/restauration des bases.

**Stack :** Node.js CommonJS, Chrome DevTools Protocol, Edge headless, tests `.cjs`,
Markdown et HTML autonome.

## Contraintes globales

- Tout texte et tout nom de test ajoutes sont en francais.
- TDD obligatoire : test en echec avant correction, puis test vert.
- Ne pas regenerer les captures 1440 utilisees par la comparaison et le deck.
- L'ancien constat automatique est un faux positif car il comparait a
  `innerWidth`. N'annoncer 0 debordement qu'apres un passage du controle corrige
  base sur `visualViewport.width`.
- Ne pas supprimer les fichiers personnels non suivis et ne rien commiter sans
  demande explicite de l'utilisateur.
- Mettre a jour `docs/jury/README.md` a chaque pause pour la reprise par Claude.

---

### Tache 1 : Verrouiller le viewport exact par un test de non-regression

**Fichiers :**
- Modifier : `test/ameliorations.cjs`
- Modifier : `scripts/captures-jury.js`

**Interface :**
- Produit : `configureViewport(cdp, largeur, hauteur)` exportee par
  `scripts/captures-jury.js`.
- Effet : envoie `Emulation.setDeviceMetricsOverride` avec `width`, `height`,
  `deviceScaleFactor: 1` et `mobile: largeur < 768`.

- [x] Ajouter dans `test/ameliorations.cjs` un faux client CDP qui enregistre les
  appels de `cmd`, appeler `configureViewport` pour 320 et 768, puis verifier les
  parametres exacts avec deux assertions.
- [x] Executer la suite et constater un echec parce que
  `configureViewport` n'est pas exportee.
- [x] Implementer la fonction minimale dans `scripts/captures-jury.js`, l'appeler
  juste apres `lanceEdge` et avant la boucle des pages, avec une hauteur de 1000.
- [x] Executer la suite apres les correctifs responsive et constater 36
  assertions vertes dans `test/ameliorations.cjs` (448 assertions au total).

### Tache 2 : Regenerer les preuves visuelles responsive

**Fichiers :**
- Regenerer : `docs/jury/captures/r320/*.png`
- Regenerer : `docs/jury/captures/r375/*.png`
- Regenerer : `docs/jury/captures/r768/*.png`
- Modifier : `docs/jury/conformite.md`
- Modifier : `docs/jury/audit-certification-dwwm.md`
- Modifier : `docs/superpowers/plans/2026-07-10-conformite-visible.md`

- [x] Demarrer le serveur dedie sur le port 4071, puis executer
  `npm run seed:demo` apres le demarrage.
- [x] Relancer les trois commandes `captures-jury.js --largeur=320|375|768` avec
  leurs dossiers de sortie actuels.
- [x] Lire les dimensions des 45 PNG et verifier que chaque dossier contient
  exactement quinze images de la largeur annoncee.
- [x] Controler visuellement au minimum `r320/annonces.png`,
  `r375/contrat.png` et `r768/admin.png`.
- [x] Amender `conformite.md`, le critere responsive de l'audit et la note de la
  Task 3 du plan de conformite : expliquer les pieges `--window-size` et
  `innerWidth`, invalider les anciennes preuves et laisser la date de
  regeneration en attente du passage navigateur final.

### Tache 3 : Aligner tous les documents actifs sur l'etat reel

**Fichiers :**
- Modifier : `README.md`, `AGENTS.md`, `.env.example`
- Modifier : `docs/jury/README.md`, `docs/jury/audit-certification-dwwm.md`
- Modifier : `docs/jury/resume-projet.md`, `docs/jury/competences-dwwm.md`
- Modifier : `docs/jury/soutenance/soutenance.html`
- Modifier : `docs/jury/soutenance/questions-reponses.md`

- [x] Remplacer les etats intermediaires `19/12/2` et les anciennes limites de
  session par l'etat final, sans supprimer l'historique utile.
- [x] Remplacer les compteurs actifs 438/442/444 par le resultat frais de la
  suite apres les correctifs responsive, soit 448 assertions.
- [x] Remplacer « douze lots livres » par « onze lots livres ; D reserve et non
  ouvert » dans le README, le resume et le deck.
- [x] Corriger `.env.example` pour pointer vers `docs/jury/base-de-donnees.md`.
- [x] Corriger les trois liens relatifs casses dans les plans du 2026-07-10.

### Tache 4 : Documenter une trajectoire base de donnees honnete

**Fichiers :**
- Modifier : `docs/jury/base-de-donnees.md`
- Modifier : `docs/jury/soutenance/questions-reponses.md`
- Modifier : `docs/jury/audit-certification-dwwm.md`
- Modifier : `README.md`

- [x] Expliquer que le code Prisma est portable mais que l'historique de
  migrations SQLite ne se rejoue pas directement sur PostgreSQL.
- [x] Documenter une creation de chaine de migrations PostgreSQL dans un
  environnement dedie, suivie de `prisma migrate deploy` et des tests.
- [x] Documenter la sauvegarde/restauration SQLite (`.backup`/`.restore` avec
  `sqlite3`) et PostgreSQL (`pg_dump`/`pg_restore`), avec arret des ecritures et
  verification apres restauration.
- [x] Maintenir le critere « environnement de production demontre » a renforcer
  tant qu'aucun deploiement PostgreSQL reel n'a ete execute.

### Tache 5 : Verification finale et passation

**Fichiers :**
- Modifier : `docs/jury/README.md`
- Modifier : ce plan

- [x] Executer `npm test` et verifier 15 suites, 448 assertions, code de sortie 0.
- [x] Executer `npx prisma validate` et verifier que le schema est valide.
- [x] Controler tous les liens Markdown et toutes les ressources locales du deck.
- [x] Executer `git diff --check` et inspecter `git status --short` pour preserver
  les trois fichiers personnels non suivis.
- [x] Cocher ce plan et ajouter au checkpoint jury : fichiers modifies,
  dimensions des captures, commandes executees et seul reste utilisateur
  (checklist clavier, repetition, decision de push).
