/**
 * Smoke test de bout en bout — MoniteurConnect.
 *
 * À ÉCRIRE (voir docs/DESIGN.md). Une fois les contrôleurs implémentés, ce test
 * rejouera le parcours complet sur un serveur dédié (port distinct), comme dans
 * AutoSchool Manager (test/smoke.cjs) :
 *   - inscription auto-école + vérification email (en posant emailVerified via Prisma) ;
 *   - connexion (régénération de session) ;
 *   - publication / modification / clôture / suppression d'une annonce ;
 *   - consultation publique + filtre par département + recherche ;
 *   - dépôt d'une candidature (formulaire + CV PDF) -> stockée + notif email ;
 *   - consultation des candidatures, téléchargement du CV ;
 *   - rejet d'un POST sans jeton CSRF, validations (bornes), cloisonnement par école ;
 *   - nettoyage des données de test.
 *
 * Pensez à injecter le jeton CSRF (scrappé du <meta name="csrf-token">) et, pour la
 * candidature multipart, à le passer en query (?_csrf=...).
 */
console.log('Smoke test non encore implémenté — voir docs/DESIGN.md.');
process.exit(0);
