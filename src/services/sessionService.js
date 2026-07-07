// Sessions persistées (table Session, données JSON sérialisées).
// Sert aux invalidations forcées : après une réinitialisation de mot de passe,
// une session encore ouverte ailleurs (navigateur oublié, cookie volé) ne doit
// plus donner accès à l'espace école.
const prisma = require('../config/prisma');

// Le JSON est compact (pas d'espace après « : ») et la valeur numérique est
// toujours suivie de « , » ou « } » : les deux motifs évitent qu'un id 12
// n'attrape les sessions de l'école 123.
function destroyForSchool(schoolId) {
  return prisma.session.deleteMany({
    where: {
      OR: [
        { data: { contains: `"schoolId":${schoolId},` } },
        { data: { contains: `"schoolId":${schoolId}}` } },
      ],
    },
  });
}

module.exports = { destroyForSchool };
