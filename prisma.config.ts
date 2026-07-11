// Configuration Prisma 7 (remplace la clé "prisma" de package.json).
// Le CLI ne charge plus le .env automatiquement : import explicite de dotenv.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/schema/migrations',
  },
  // Depuis Prisma 7, l'URL de connexion du CLI (migrate/studio) vit ici, plus
  // dans le schéma. Relative à la racine du dépôt : "file:./prisma/dev.db".
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
