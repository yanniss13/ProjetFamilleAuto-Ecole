# Diagramme fonctionnel — MoniteurConnect

**MoniteurConnect** est une plateforme d'annonces reliant les **auto-écoles**
(comptes authentifiés) aux **moniteurs indépendants** (qui postulent sans créer
de compte).

---

## 1. Diagramme fonctionnel global

```mermaid
flowchart TB
    subgraph ACTEURS[" "]
        direction LR
        MON(["🧑‍🏫 Moniteur indépendant<br/>(sans compte)"])
        ECOLE(["🏫 Auto-école<br/>(compte authentifié)"])
    end

    subgraph PUBLIC["🌐 ESPACE PUBLIC"]
        ACCUEIL["Accueil"]
        RECHERCHE["Recherche d'annonces<br/>filtres : département, type de contrat"]
        DETAIL["Détail d'une annonce<br/>+ carte de localisation"]
        POSTULER["Déposer une candidature<br/>CV, pièce d'identité,<br/>permis, carte d'enseignant"]
    end

    subgraph AUTH["🔐 AUTHENTIFICATION (auto-école)"]
        INSCRIPTION["Inscription<br/>+ vérification e-mail"]
        CONNEXION["Connexion / Déconnexion"]
        MDP["Mot de passe oublié<br/>/ réinitialisation"]
    end

    subgraph PRIVE["👤 ESPACE AUTO-ÉCOLE (privé)"]
        DASH["Tableau de bord<br/>vue d'ensemble"]
        COMPTE["Mon compte<br/>profil + adresse géocodée"]
        GEST_ANN["Gestion des annonces<br/>créer · modifier · clôturer · supprimer"]
        GEST_CAND["Consultation des candidatures<br/>téléchargement des pièces"]
        DECISION["Accepter / Refuser"]
        CONTRAT["Génération du contrat (PDF)<br/>télécharger · envoyer au candidat"]
    end

    EMAIL["📧 Notifications e-mail<br/>(Nodemailer)"]

    %% Parcours moniteur
    MON --> ACCUEIL --> RECHERCHE --> DETAIL --> POSTULER
    POSTULER -->|candidature enregistrée| GEST_CAND

    %% Parcours auto-école
    ECOLE --> AUTH
    INSCRIPTION -. lien de vérification .-> EMAIL
    MDP -. lien de réinitialisation .-> EMAIL
    AUTH --> PRIVE
    DASH --> GEST_ANN
    GEST_ANN -->|publie| DETAIL
    GEST_CAND --> DECISION
    DECISION -->|accepté| CONTRAT
    DECISION -. notification .-> EMAIL
    CONTRAT -->|contrat PDF| EMAIL
    EMAIL -. reçu par .-> MON
```

---

## 2. Processus métier central (annonce → recrutement)

```mermaid
flowchart LR
    A["École publie<br/>une annonce"] --> B["Moniteur trouve<br/>l'annonce"]
    B --> C["Moniteur postule<br/>(dépose ses pièces)"]
    C --> D["École consulte<br/>la candidature"]
    D --> E{Décision}
    E -->|Refus| F["Candidature refusée"]
    E -->|Acceptation| G["Saisie des termes<br/>du contrat"]
    G --> H["Génération<br/>du contrat PDF"]
    H --> I["Envoi du contrat<br/>au moniteur par e-mail"]
```

---

## 3. Modèle de données (entités)

```mermaid
erDiagram
    SCHOOL ||--o{ LISTING : "publie"
    LISTING ||--o{ APPLICATION : "reçoit"
    APPLICATION ||--o| CONTRACT : "génère (1-1)"

    SCHOOL {
        string email "unique"
        string businessName
        string siret "unique"
        string address "+ lat/lng géocodés"
        bool emailVerified
    }
    LISTING {
        string title
        string contractType "cdi/cdd/freelance/apprentissage"
        string city
        string department "indexé"
        string status "open/closed"
    }
    APPLICATION {
        string applicantName
        string applicantEmail
        string cvPath
        string idCardPath
        string licensePath
        string status "pending/accepted/rejected"
    }
    CONTRACT {
        string type
        date startDate
        string grossSalary
        string pdfPath
        date sentToApplicantAt
    }
```

---

## 4. Architecture technique

Application **Express 5** organisée en MVC (CommonJS) :

```
routes → controllers → services → Prisma (ORM) → SQLite / PostgreSQL
```

| Couche | Rôle | Implémentation |
|--------|------|----------------|
| **Vues** | Rendu HTML | Twig (autoescape activé) |
| **Routes** | Points d'entrée HTTP | `src/routes/` |
| **Middlewares** | Session, CSRF, flash, auth, upload, rate-limit | `src/middlewares/` |
| **Contrôleurs** | Orchestration requête/réponse | `src/controllers/` |
| **Services** | Logique métier (contrats, e-mail, géocodage, jetons) | `src/services/` |
| **Données** | ORM + base | Prisma → SQLite (dev) / PostgreSQL (prod) |

**Sécurité** : Helmet, protection CSRF, sessions httpOnly, rate-limiting
(anti brute-force), hash des mots de passe (bcrypt) et des jetons.

**Briques externes** : génération PDF (**pdfkit**), envoi d'e-mails
(**Nodemailer**), géocodage d'adresses (**Nominatim**), cartes (**Leaflet**).

---

## 5. Diagrammes de cas d'utilisation (UML)

Notation UML : les **acteurs** (bonhommes) sont à l'extérieur du **cadre système**,
les **cas d'utilisation** sont des ellipses (verbe à l'infinitif), reliés par des
**associations** (traits pleins). Les dépendances entre cas utilisent des stéréotypes
`«include»` / `«extends»`, et la **généralisation/spécialisation** un trait plein
terminé par un triangle fermé pointant vers le cas le plus général. Un diagramme par
acteur.

### 5.1 Acteur : Moniteur (espace public)

![Diagramme de cas d'utilisation — Moniteur](../spec-assets/cas-utilisation-moniteur.png)

- **Association** : le moniteur peut *consulter les annonces*, *consulter une annonce*
  et *postuler à une annonce* — sans créer de compte.
- **`«extends»`** (optionnel) : *Filtrer les annonces* étend *Consulter les annonces* ;
  *Voir la localisation* (carte) étend *Consulter une annonce*.
- **`«include»`** (obligatoire) : *Postuler à une annonce* inclut *Joindre ses documents*
  (CV, pièce d'identité, permis, carte d'enseignant).

### 5.2 Acteur : Auto-école (espace authentifié)

![Diagramme de cas d'utilisation — Auto-école](../spec-assets/cas-utilisation-auto-ecole.png)

- **Association** : *s'inscrire*, *se connecter*, *réinitialiser le mot de passe*,
  *gérer son profil*, *publier une annonce*, *gérer ses annonces*, *traiter une candidature*.
- **`«include»`** : *S'inscrire* inclut *Vérifier l'e-mail* ; *Accepter la candidature*
  inclut *Générer le contrat*.
- **`«extends»`** : *Envoyer le contrat* étend *Générer le contrat* (étape optionnelle).
- **Généralisation / spécialisation** :
  - *Modifier*, *Clôturer* et *Supprimer une annonce* spécialisent *Gérer ses annonces* ;
  - *Accepter* et *Refuser la candidature* spécialisent *Traiter une candidature*.

> Versions imprimables : [`diagramme-cas-utilisation-moniteur.pdf`](diagramme-cas-utilisation-moniteur.pdf)
> · [`diagramme-cas-utilisation-auto-ecole.pdf`](diagramme-cas-utilisation-auto-ecole.pdf).
> Sources éditables (SVG) dans [`../spec-assets/`](../spec-assets/).
