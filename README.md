# GR9 — Portfolio SISR (boutique de compétences)

Portfolio BTS SIO SISR de Gracis Wizana Mfumu. Les visiteurs parcourent une **boutique de compétences**, constituent une **sélection** (sans paiement) et l'envoient avec un message.

## Navigation
Pages isolées par hash : `#accueil`, `#catalogue` (Boutique), `#realisations`, `#veille`, `#parcours`, `#contact`.
Chaque section a sa **sous-navigation**, affichée uniquement après un clic sur la section (`#catalogue/net`, `#parcours/formation`, …). Sur la Boutique et les Réalisations, les sous-liens filtrent par catégorie.

## Modifier le contenu
Tout le contenu est dans **`data/catalog.json`** (une seule source pour la boutique, les projets, les outils, les niveaux de la page Parcours et l'assistant) :
- `skills` : fiches compétences (`level` : 1 Notions · 2 Pratique · 3 Maîtrisé en labo)
- `projects` : réalisations ; `tools` : outils affichés (chaque outil renvoie vers les compétences qui l'utilisent)

Vérifier la cohérence après modification : `npm run check` (références, catégories, projets, outils, veille).

## Deux modes de déploiement

**A. GitHub Pages (site statique)** — la boutique, la sélection, les projets et la veille fonctionnent. Le formulaire ouvre l'application mail (mailto), l'assistant répond en mode local (recherche dans le catalogue).
Pour garder la veille à jour : Settings → Secrets and variables → Actions → secret **`GEMINI_API_KEY`**. Le workflow `.github/workflows/veille.yml` met à jour `data/news.json` toutes les 2 h (collecte des flux, tri/traduction par Gemini, contrôle de cohérence).

**B. Serveur Node (`npm start`)** — veille en direct (`/api/news`), assistant Gemini (`/api/assistant`) et formulaire avec pièces jointes (`/api/contact`).
```bash
npm install
cp .env.example .env     # renseigner GEMINI_API_KEY et les paramètres SMTP
npm start                # http://localhost:3000
```

## Clé Gemini : règles
- La clé reste **côté serveur** (`.env`) ou dans un **secret GitHub**. Jamais dans `index.html`, `js/` ni dans un dépôt public : tout le code de `js/` est lisible par les visiteurs.
- `.env` est ignoré par git. Si une clé a été exposée (chat, capture, dépôt), la **régénérer** dans Google AI Studio.

## Sécurité
Fichiers servis en liste blanche (`css/`, `js/`, `data/`, `assets/`), CSP stricte, limites de débit sur l'assistant et le contact, extensions de pièces jointes contrôlées, contenu de veille assaini (serveur et navigateur), liens de veille limités à des domaines de confiance.
