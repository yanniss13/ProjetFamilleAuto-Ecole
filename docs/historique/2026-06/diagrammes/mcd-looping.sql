-- =====================================================================
--  MoniteurConnect — DDL pour rétroconception (import) dans Looping 4.1
-- =====================================================================
--  Looping > Outils > "Génération du MCD à partir du SQL" (rétroconception)
--  collez ce script, puis enregistrez le modèle obtenu en .loo
--
--  Les colonnes "*_id" ci-dessous portent les FOREIGN KEY : Looping les
--  transforme en ASSOCIATIONS (et NON en attributs), conformément au MCD.
--  Renommez ensuite les associations générées en :
--     ANNONCE -> ECOLE        =  PUBLIER   (0,n / 1,1)
--     CANDIDATURE -> ANNONCE  =  RECEVOIR  (0,n / 1,1)
--     CONTRAT -> CANDIDATURE  =  GENERER   (0,1 / 1,1)
--  Noms d'attributs : MCD (français) — types : déduits de prisma/schema.prisma
-- =====================================================================

-- ---------- ECOLE (le seul compte authentifié) ----------------------
CREATE TABLE ECOLE (
  id              INT          NOT NULL AUTO_INCREMENT,
  email           VARCHAR(255) NOT NULL,
  motDePasse      VARCHAR(255) NOT NULL,
  raisonSociale   VARCHAR(255) NOT NULL,
  siret           VARCHAR(14)  NOT NULL,
  telephone       VARCHAR(20),
  adresse         VARCHAR(255),
  latitude        DOUBLE,
  longitude       DOUBLE,
  emailVerifie    BOOLEAN      NOT NULL,
  jetonVerifEmail VARCHAR(255),
  expVerifEmail   DATETIME,
  jetonResetMdp   VARCHAR(255),
  expResetMdp     DATETIME,
  dateCreation    DATETIME     NOT NULL,
  dateMaj         DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (email),
  UNIQUE (siret)
);

-- ---------- ANNONCE (publiée par une ECOLE) -------------------------
CREATE TABLE ANNONCE (
  id               INT          NOT NULL AUTO_INCREMENT,
  titre            VARCHAR(255) NOT NULL,
  description      TEXT         NOT NULL,
  typeContrat      VARCHAR(50),
  ville            VARCHAR(100) NOT NULL,
  departement      VARCHAR(10)  NOT NULL,
  heuresParSemaine INT,
  remuneration     VARCHAR(100),
  statut           VARCHAR(20)  NOT NULL,
  dateCreation     DATETIME     NOT NULL,
  dateMaj          DATETIME     NOT NULL,
  ecole_id         INT          NOT NULL,   -- FK -> ECOLE (association PUBLIER)
  PRIMARY KEY (id)
);

-- ---------- CANDIDATURE (déposée sans compte, sur une ANNONCE) ------
CREATE TABLE CANDIDATURE (
  id                    INT          NOT NULL AUTO_INCREMENT,
  nomCandidat           VARCHAR(255) NOT NULL,
  emailCandidat         VARCHAR(255) NOT NULL,
  telephoneCandidat     VARCHAR(20),
  message               TEXT         NOT NULL,
  cheminCV              VARCHAR(255),
  cheminPieceIdentite   VARCHAR(255),
  cheminPermis          VARCHAR(255),
  cheminCarteEnseignant VARCHAR(255),
  statut                VARCHAR(20)  NOT NULL,
  dateCreation          DATETIME     NOT NULL,
  annonce_id            INT          NOT NULL,   -- FK -> ANNONCE (association RECEVOIR)
  PRIMARY KEY (id)
);

-- ---------- CONTRAT (généré 1-1 depuis une CANDIDATURE) -------------
CREATE TABLE CONTRAT (
  id                       INT          NOT NULL AUTO_INCREMENT,
  type                     VARCHAR(50)  NOT NULL,
  dateDebut                DATETIME     NOT NULL,
  dateFin                  DATETIME,
  motif                    VARCHAR(255),
  salaireBrut              VARCHAR(100) NOT NULL,
  heuresHebdo              INT,
  periodeEssai             INT,
  lieuTravail              VARCHAR(255) NOT NULL,
  siretPrestataire         VARCHAR(14),
  adresseEcole             VARCHAR(255),
  adresseCandidat          VARCHAR(255),
  clausesSupplementaires   TEXT,
  dateNaissance            DATETIME,
  lieuNaissance            VARCHAR(255),
  nationalite              VARCHAR(100),
  numAutorisationEnseigner VARCHAR(100),
  validiteAutorisation     DATETIME,
  numPermis                VARCHAR(50),
  categoriesPermis         VARCHAR(50),
  cheminPdf                VARCHAR(255) NOT NULL,
  envoyeLe                 DATETIME,
  dateCreation             DATETIME     NOT NULL,
  dateMaj                  DATETIME     NOT NULL,
  candidature_id           INT          NOT NULL,   -- FK UNIQUE -> CANDIDATURE (association GENERER, 1-1)
  PRIMARY KEY (id),
  UNIQUE (candidature_id)
);

-- ---------- Clés étrangères = associations du MCD -------------------
ALTER TABLE ANNONCE
  ADD CONSTRAINT fk_publier_ecole
  FOREIGN KEY (ecole_id) REFERENCES ECOLE (id);

ALTER TABLE CANDIDATURE
  ADD CONSTRAINT fk_recevoir_annonce
  FOREIGN KEY (annonce_id) REFERENCES ANNONCE (id);

ALTER TABLE CONTRAT
  ADD CONSTRAINT fk_generer_candidature
  FOREIGN KEY (candidature_id) REFERENCES CANDIDATURE (id);
