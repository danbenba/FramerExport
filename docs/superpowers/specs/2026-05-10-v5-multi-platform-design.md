# Framer Export v5 — Multi-Platform Design Spec

**Date** : 2026-05-10
**Author** : Dany (danbenba)
**Status** : Draft, awaiting approval
**Target version** : v5.0.0 → v5.6.0 (release continue)

---

## 1. Objectif

Étendre Framer Export (actuellement v4.4.3, 3 plateformes : Framer, Webflow, Wix) pour exporter **28 plateformes** au total. Chaque export doit être **pixel-perfect** quand servi via `serve.js` localement. Pas de support auth-gated en v5 — uniquement les pages publiques.

### Plateformes ajoutées (25)

| Catégorie | Plateformes |
|---|---|
| Website Builders | Bubble, Carrd, Duda, Squarespace, Strikingly, Tilda, Weebly |
| Landing Pages & Funnels | ClickFunnels, Elementor, Instapage, Systeme.io, Unbounce |
| CMS & Blogs | Ghost, Notion, WordPress |
| Courses & Membership (public) | Kajabi, Podia, Teachable, Thinkific |
| E-commerce | Gumroad, Shopify |
| AI & Presentations | Gamma |

### Critères de succès

1. **GARANTIE ABSOLUE — Aucune régression sur Framer, Webflow, Wix.** Détection, capture, strip, asset mapping, sub-pages, output : strictement identique à v4. Voir §2.6 pour le mécanisme de non-régression.
2. Chaque nouvelle plateforme a un handler avec : détection, strip badges, asset mapping, sub-pages support.
3. Pour chaque plateforme : un export d'un site réel, servi via `serve.js`, est visuellement fidèle (≥99.5% de similarité pixel ou inspection manuelle validée).
4. CLI permet de chercher/sélectionner parmi 28 plateformes sans friction.
5. Release incrémentale : une phase = une version mineure ; jamais de plateforme à moitié supportée.
6. **Un fichier par exporter** : chaque plateforme = exactement un module dans `src/platforms/<category>/<platform>.ts`. Pas de fusion, pas de partage de fichier, pas d'export multiple par fichier. Ça facilite le diff, la review, l'isolation des régressions.
7. **Erreurs anti-bot explicites** : si Cloudflare/captcha/WAF bloque l'export, l'utilisateur voit un message d'erreur clair dans la CLI (jamais d'échec silencieux ou de fichier vide). Voir §6.

### Non-objectifs (v5)

- Auth-gated content (cours payants, funnels privés, membres-only). → reporté à v6.
- Pages multi-routes complexes (catalogue Shopify entier, base Notion entière). Page d'entrée seulement pour la v5.
- Système de plugins externes (out of scope, YAGNI).

---

## 2. Architecture

### 2.1 Vue d'ensemble

La pipeline actuelle est conservée :
```
URL → SSR fetch → Puppeteer launch → page hydration → asset capture
    → strip badges → rewrite URLs → pretty-print JS → serve.js
```

L'extension v5 modifie deux axes :
1. **Interface `PlatformHandler` étendue** — champs optionnels pour absorber les particularités sans casser l'existant.
2. **Registry de plateformes catégorisé** — un endroit unique liste les 28 handlers, le CLI et la détection le consomment.

### 2.2 Interface `PlatformHandler` étendue

Fichier : `src/platforms/types.ts`

```ts
export type PlatformCategory = 'builder' | 'landing' | 'cms' | 'course' | 'ecommerce' | 'ai';

export interface PlatformHandler {
  // identité
  name: PlatformType;
  displayName: string;
  category: PlatformCategory;          // NEW
  priority: number;                    // NEW — résolution de conflit (0–100)

  // détection
  detectByUrl(url: string): boolean;
  detectByHtml(html: string): boolean;
  detectByDom?(page: Page): Promise<boolean>;
  detectGenerator?: RegExp;            // NEW — meta name="generator"

  // stripping
  stripDomains: string[];
  stripSelectors: string[];
  stripPatterns: RegExp[];
  stripScripts?: RegExp[];             // NEW — match scripts inline

  // capture
  hydrationTimeout: number;
  needsHydrationCheck: boolean;
  hydrationSelector?: string;          // NEW — défaut "#main"
  scrollStrategy?: 'standard' | 'infinite' | 'paginated' | 'none';   // NEW

  // assets
  mapAssetDir(host: string, pathname: string, ext: string): string | null;
  rewriteUrlPatterns?: Array<{ from: RegExp; to: string }>;   // NEW

  // hooks
  preCapture?(page: Page): Promise<void>;                         // NEW
  postCapture?(html: string, ctx: ExporterContext): string;       // NEW
  postProcess?(ctx: ExporterContext): Promise<void>;              // NEW
}
```

**Contrat de rétro-compatibilité** : tout champ `?` est optionnel, donc `framer.ts`, `webflow.ts`, `wix.ts` ne nécessitent que l'ajout de `category` et `priority`.

### 2.3 Registry & détection

Fichier nouveau : `src/platforms/registry.ts`

```ts
export const PLATFORM_REGISTRY: PlatformHandler[] = [
  framer, webflow, wix,                                  // existants
  bubble, carrd, duda, squarespace, strikingly, tilda, weebly,
  unbounce, instapage, clickfunnels, systemeio, elementor,
  ghost, notion, wordpress,
  kajabi, podia, teachable, thinkific,
  shopify, gumroad,
  gamma,
];

export function platformsByCategory(): Record<PlatformCategory, PlatformHandler[]> { … }
```

`src/platforms/detect.ts` est réécrit pour :
1. Trier par `priority` desc.
2. Itérer 4 stratégies dans l'ordre : `detectByUrl` → `detectByGenerator` → `detectByHtml` → `detectByDom`.
3. Retourner le premier match. Conflits : priorité plus haute gagne.

**Priorité initiale** (suggestion, à valider à l'usage) :
- 95 : Framer (`.framer.app`, `.framer.website`)
- 90 : Webflow (`.webflow.io`)
- 88 : Wix (`.wixsite.com`)
- 85 : Bubble (`.bubbleapps.io`)
- 85 : Carrd (`.carrd.co`)
- 82 : Tilda (`.tilda.ws`)
- 80 : Squarespace (`.squarespace.com`)
- 80 : Strikingly (`.mystrikingly.com`)
- 78 : Weebly (`.weebly.com`)
- 75 : Duda (`.dudaone.com`, `.multiscreensite.com`)
- 70 : Unbounce (`.unbounce.com`)
- 70 : Instapage (`.instapage.com`)
- 68 : ClickFunnels (`.clickfunnels.com`, `.cf-funnels.com`)
- 65 : Systeme.io (`.systeme.io`)
- 65 : Kajabi (`.mykajabi.com`)
- 62 : Teachable (`.teachable.com`)
- 60 : Thinkific (`.thinkific.com`)
- 60 : Podia (`.podia.com`)
- 55 : Gumroad (`.gumroad.com`)
- 55 : Ghost (`.ghost.io` + generator)
- 50 : Gamma (`.gamma.app`)
- 45 : Notion (`.notion.site`, `.notion.so`)
- 40 : Shopify (`.myshopify.com` + window.Shopify pour custom domain)
- 30 : Elementor (generator detection sur WP avec `data-elementor`)
- 25 : WordPress (generator detection — bas car custom domain courant)

### 2.4 CLI : sélecteur groupé avec recherche

Fichier nouveau : `src/cli/select-grouped.ts`

UX :
```
┌────────────────────────────────────────────────────────────┐
│  Select platform                          /  search        │
├────────────────────────────────────────────────────────────┤
│  ▾ Website Builders (10)                                   │
│      ●  Framer       (detected)                            │
│         Webflow                                            │
│         Wix                                                │
│         Bubble                                             │
│         Carrd                                              │
│         …                                                  │
│  ▸ Landing Pages & Funnels (5)                             │
│  ▸ CMS & Blogs (3)                                         │
│  ▸ Courses & Membership (4)                                │
│  ▸ E-commerce (2)                                          │
│  ▸ AI & Presentations (1)                                  │
└────────────────────────────────────────────────────────────┘
   ↑↓ navigate   →← expand   /  search   ⏎ select
```

- Tape `/` pour activer le filtre, fuzzy match sur `displayName`.
- Si plateforme auto-détectée : groupe pré-déplié, curseur sur l'élément, label `(detected)`.
- Fallback `legacyMode` : prompt textuel listant les 28 noms en colonnes.

### 2.5 Structure de fichiers

```
src/platforms/
  types.ts             # interface étendue
  registry.ts          # NEW
  detect.ts            # refacto
  index.ts             # exports élargis
  framer.ts | webflow.ts | wix.ts   # +category +priority
  builder/
    bubble.ts | carrd.ts | duda.ts | squarespace.ts |
    strikingly.ts | tilda.ts | weebly.ts
  landing/
    clickfunnels.ts | elementor.ts | instapage.ts |
    systemeio.ts | unbounce.ts
  cms/
    ghost.ts | notion.ts | wordpress.ts
  course/
    kajabi.ts | podia.ts | teachable.ts | thinkific.ts
  ecommerce/
    gumroad.ts | shopify.ts
  ai/
    gamma.ts
src/cli/
  select-grouped.ts    # NEW
  setup.ts             # refacto
tests/
  fixtures.json        # NEW — { platform → real public URL }
  detect.test.ts       # NEW
  screenshots/<platform>/before.png after.png
scripts/
  validate-platform.ts # NEW — orchestre export + serve + screenshot diff
```

**Règle "un fichier = un exporter"** : chaque plateforme a son propre fichier `<platform>.ts`. Pas de mutualisation, pas de fonctions partagées entre plateformes (helpers communs autorisés dans `src/platforms/_shared/` si nécessaire). Cette règle facilite : diff isolés, review ciblée, debug par plateforme, ajout futur d'une plateforme sans toucher aux autres.

### 2.6 Gel de non-régression Framer / Webflow / Wix

Les 3 plateformes existantes sont **gelées au niveau comportement** dès la Phase 0. Aucun changement fonctionnel sur leur pipeline n'est autorisé en v5.

**Mécanisme de gel** :

1. **Snapshot de référence v4** : avant tout refactor, exporter les 3 sites de référence (un site Framer, un Webflow, un Wix réels) avec la v4.4.3 actuelle. Sauvegarder :
   - `tests/snapshots/framer/v4-export/` (dossier complet)
   - `tests/snapshots/webflow/v4-export/`
   - `tests/snapshots/wix/v4-export/`
   - Plus un screenshot rendu de chaque (`v4-render.png`).

2. **Test de non-régression automatisé** : `tests/regression.test.ts`
   - Pour chaque plateforme gelée, ré-export avec la v5 en cours.
   - Compare arborescence (mêmes fichiers, mêmes dossiers).
   - Compare hash SHA-256 des fichiers HTML stripés (tolérance whitespace).
   - Compare nombre d'assets téléchargés (±2% accepté pour CDN volatil).
   - Render via `serve.js` + screenshot, diff avec `v4-render.png` (seuil 0.5%).

3. **Gate Phase 0** : ces 3 tests doivent passer **avant** chaque commit de la phase 0. Si un commit casse, on revert immédiatement.

4. **Gate continue Phase 1+** : les 3 tests tournent en CI (ou en local via `npm run test:regression`) à chaque commit, peu importe la phase. Une régression sur Framer/Webflow/Wix bloque le merge.

5. **Fichiers gelés** : `src/platforms/framer.ts`, `src/platforms/webflow.ts`, `src/platforms/wix.ts` ne reçoivent **que** les ajouts de `category` + `priority` en Phase 0. Aucun autre changement n'est autorisé en v5 sans accord explicite et update du spec.

---

## 3. Validation pixel-perfect

### 3.1 Rituel par plateforme

Pour chaque plateforme, avant le commit `test(<platform>): pixel-perfect validation` :

1. **URL réelle publique** ajoutée à `tests/fixtures.json`.
2. **Export** : `framer-export <url> --platform=<name>` → dossier temp.
3. **Serve local** : `cd <temp> && node serve.js` (port 3000).
4. **Capture screenshots** (Puppeteer 1440×900, scroll complet stitched) :
   - `before.png` ← `<url>`
   - `after.png`  ← `http://localhost:3000`
5. **Diff** :
   - Phase 0 : inspection visuelle manuelle, 2 PNG sauvegardés dans `tests/screenshots/<platform>/`.
   - Phase 0+ (option) : `pixelmatch` avec seuil 0.5%.
6. **Critères Go** :
   - Aucun badge "Made with X" visible.
   - 100% des images chargent (HTTP 200 dans serve.js logs).
   - Layout/spacing intact.
   - Animations CSS actives.
   - Liens internes fonctionnels (vers subpages capturées) ou dégradent gracieusement.
7. **Critères No-Go** : on n'avance pas, on debug avec `superpowers:systematic-debugging`.

### 3.2 Outil

`scripts/validate-platform.ts` automatise les étapes 2–5 :
```
npx tsx scripts/validate-platform.ts <platform> <url>
  → export, lance serve.js (port aléatoire), capture before/after,
    sauve les PNG, calcule similarité, exit 0/1.
```

Stocke aussi un `validation-report.md` par plateforme.

---

## 4. Phasing & versions

| Phase | Version git tag | Plateformes | Commits estimés |
|---|---|---|---|
| 0 | v5.0.0-alpha.1 | Refactor + tests sur Framer/Webflow/Wix | ~15 |
| 1 | v5.1.0 | Bubble, Carrd, Duda, Squarespace, Strikingly, Tilda, Weebly | ~14 |
| 2 | v5.2.0 | ClickFunnels, Elementor, Instapage, Systeme.io, Unbounce | ~10 |
| 3 | v5.3.0 | Ghost, Notion, WordPress | ~9 |
| 4 | v5.4.0 | Kajabi, Podia, Teachable, Thinkific | ~8 |
| 5 | v5.5.0 | Gumroad, Shopify | ~6 |
| 6 | v5.6.0 | Gamma | ~3 |
| **Total** | **v5.6.0** | **28 plateformes** | **~65–80 commits** |

### 4.1 Workflow par plateforme (Phase 1+)

3 commits standards :
1. `feat(<platform>): add detection skeleton` — fichier handler avec detect URL/HTML, category, priority, hooks vides.
2. `feat(<platform>): add strip patterns + asset mapping` — badges, CDN domains, mapAssetDir.
3. `test(<platform>): pixel-perfect validation` — fixture URL, screenshots avant/après, validation manuelle ou pixelmatch OK.

Variantes plus volumineuses :
- **Notion** (4 commits) : +1 pour `postProcess` qui restaure le DOM hydraté en HTML statique propre.
- **Shopify** (4 commits) : +1 pour stealth (anti-bot Cloudflare possible).
- **WordPress** (4 commits) : +1 pour parser `<meta generator>` + bot d'inspection plugins (Elementor, Divi).

### 4.2 Phase 0 — décomposition des ~15 commits

1. `refactor(platforms): add category + priority fields to interface`
2. `refactor(platforms): mark detection fields optional with fallbacks`
3. `feat(platforms): add hydrationSelector + scrollStrategy fields`
4. `feat(platforms): add preCapture/postCapture/postProcess hooks`
5. `chore(framer): set category + priority`
6. `chore(webflow): set category + priority`
7. `chore(wix): set category + priority`
8. `feat(platforms): create central registry`
9. `refactor(platforms/detect): rewrite to consume registry with priority`
10. `feat(platforms): add detectByGenerator strategy`
11. `feat(cli): create grouped selector with fuzzy search`
12. `refactor(cli/setup): consume registry instead of hardcoded list`
13. `test(platforms): add detection fixtures + regression test`
14. `feat(scripts): add validate-platform.ts pixel-diff tool`
15. `chore: bump version to 5.0.0-alpha.1`

---

## 5. Protocole de recherche par plateforme (rigoureux)

Avant d'écrire UN SEUL caractère du handler `<platform>.ts`, le workflow obligatoire est le suivant. Chaque étape produit un **artefact écrit** (fichier ou note dans le commit message) qui justifie les choix du handler.

### 5.1 Étapes obligatoires (8 étapes)

**1. Choix de 3 sites de référence publics**
   - 1 site officiel/showcase de la plateforme.
   - 1 site client réel (pas custom domain pour faciliter la détection).
   - 1 site custom domain pour stress-tester la détection.
   - Sauvegarder les 3 URLs dans `tests/fixtures.json` sous la clé de la plateforme.

**2. Capture firecrawl** sur chaque URL → HTML brut + screenshot dans `tests/research/<platform>/`.

**3. Inspection systématique** (checklist non-négociable, à remplir dans `tests/research/<platform>/signatures.md`) :
   - [ ] Hosting domain pattern (regex)
   - [ ] `<meta name="generator">` exact content
   - [ ] HTML attributes uniques (`data-*`, `id="…"` particuliers)
   - [ ] Classes CSS racine uniques
   - [ ] CDN domains (tous, listés)
   - [ ] Globals JS exposés (à inspecter via Puppeteer `Object.keys(window)`)
   - [ ] Scripts d'analytics tiers injectés par défaut
   - [ ] Badge "Made with X" : sélecteur exact + pattern HTML + URL cible
   - [ ] Stratégie de rendu : SSR pur / hydratation React / SPA full / Hybride
   - [ ] Existence de routes alternatives (sitemap, robots.txt, page list)

**4. Recherche docs avec Context7** (si SDK/API doc existe) :
   - Shopify : `mcp__context7__resolve-library-id` "Shopify Liquid" → `query-docs`
   - Notion : "Notion API" / "react-notion-x"
   - Ghost : "Ghost JSON API"
   - WordPress : "WordPress REST API"
   - Squarespace : "Squarespace Developer Platform"
   - Webflow (déjà fait), Framer (déjà fait), Wix (déjà fait) — gelés.
   - Documenter les findings dans `signatures.md`.

**5. Recherche web ouverte avec firecrawl** :
   - Comment d'autres outils OSS ont scrapé cette plateforme (chercher GitHub : "<platform> scraper", "<platform> exporter", "<platform> mirror").
   - Issues connues (Cloudflare, captcha, rate limit).
   - Documenter les patterns dans `signatures.md`.

**6. Test manuel anti-bot** :
   - Curl le site → status code ?
   - Puppeteer headless avec UA Chrome 131 → succès ?
   - Si bloqué → noter dans `signatures.md` section "Anti-bot detected: <type>".

**7. Synthèse des décisions** :
   - Quelle priorité (0–100) ?
   - Quels champs de l'interface étendue sont activés ?
   - Quelles regex de strip ?
   - Quel CDN mapping ?
   - Quel scrollStrategy ?
   - À écrire en haut du futur fichier handler comme commentaire de tête.

**8. Création du handler** : SEULEMENT à ce stade, écrire `src/platforms/<category>/<platform>.ts`.

### 5.2 Notes par plateforme à risque

- **Notion** — page React hydratée, pas de SSR utile. Solution : capturer le DOM final via Puppeteer (`document.documentElement.outerHTML` après hydration), ne pas utiliser le SSR fetch. Ajouter `postProcess` qui inline les CSS Notion. Possiblement consulter `react-notion-x` (lib OSS) pour les classes CSS canoniques.
- **Shopify** — beaucoup de custom domains, anti-bot Cloudflare **fréquent**. Détection : `window.Shopify`, `cdn.shopify.com`. Si Cloudflare bloque : voir §6 (gestion d'erreur explicite + stealth optionnel).
- **WordPress** — détection via `<meta name="generator" content="WordPress …">` ou `wp-content/`/`wp-includes/`. Custom domains majoritaires. Priorité basse (25) car beaucoup d'autres handlers peuvent matcher avant si actifs. Préférer la détection par generator.
- **Elementor** — posé sur WordPress. Détection : `data-elementor-*`, `body class="elementor-…"`. v5.2 = handler dédié qui surcharge WordPress. v5 ne va pas jusqu'à reconstituer Elementor à 100%, juste strip badge + assets.
- **Gamma** — slides animées. v5.6 capture la slide 1 (page d'entrée publique) ; sub-pages = autres slides via `?card=N` éventuellement. Gros risque anti-bot car SaaS récent.
- **Bubble** — apps Bubble lourdes en JS. Hydration longue (`hydrationTimeout: 8000`). Strip `bubble.io` analytics. Custom domains via plan payant.
- **Squarespace** — domaines custom dominants, détection via `static1.squarespace.com` + `<meta name="generator" content="Squarespace …">`. Cloudflare possible sur certains plans.
- **ClickFunnels** — beaucoup d'anti-bot. Possiblement bloqué dès la première requête → erreur claire à l'utilisateur.

---

## 6. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Régression sur Framer/Webflow/Wix | Gel formel §2.6, snapshots v4 sauvegardés, `tests/regression.test.ts` en CI à chaque commit. |
| Détection multi-match (ex. WP + plugin) | Champ `priority`, ordre déterministe, test fixtures. |
| Anti-bot (Cloudflare, captchas) | Détection explicite + erreur CLI claire (voir §6.1). Stealth plugin optionnel. Pas d'échec silencieux. |
| Pixel-diff faux positifs (fonts, anti-aliasing) | Seuil 0.5%, fallback inspection manuelle. |
| Plateformes qui changent leurs signatures | Tests fixtures cassent en CI → on update au cas par cas. Versioning tolérant. |
| Scope creep (tentation auth-gated) | NON-OBJECTIF formel dans ce spec. Reporter à v6. |

### 6.1 Détection Cloudflare / anti-bot — gestion d'erreur explicite

**Principe** : si Cloudflare, un WAF, ou un captcha bloque l'export, l'utilisateur DOIT voir un message clair. Jamais d'échec silencieux, jamais de fichier vide, jamais d'export "partiel masqué".

**Détection** (à implémenter dans `src/exporter/capture.ts` ou un nouveau `src/exporter/anti-bot.ts`) :

1. **HTTP status code** :
   - 403 Forbidden → suspicion forte
   - 503 Service Unavailable + header `cf-mitigated: challenge` → certain Cloudflare
   - 429 Too Many Requests → rate limit

2. **Markers HTML** dans la réponse SSR :
   - `<title>Just a moment...</title>` (Cloudflare interstitial)
   - `cf-browser-verification` / `cf-challenge-running` (classes/IDs)
   - `Attention Required! | Cloudflare`
   - `Please enable cookies` + Cloudflare branding
   - `g-recaptcha` ou `h-captcha` widget visible avant le contenu

3. **Markers Puppeteer** post-navigation :
   - `await page.title()` retourne "Just a moment..."
   - `document.querySelector('iframe[src*="challenges.cloudflare.com"]')` non-null
   - `document.body.innerText.length < 200` après hydration prévue

**Réaction** :

```
✗ ERREUR : <platform> est protégé par Cloudflare (challenge interstitiel détecté).

  L'export n'a pas pu se faire car le site nécessite une vérification
  navigateur que l'exporter headless ne peut pas franchir.

  Options :
    1. Réessayer plus tard (le challenge peut expirer)
    2. Activer le mode stealth : framer-export <url> --stealth
       (nécessite : npm install puppeteer-extra-plugin-stealth)
    3. Si le site dispose d'une URL canonique alternative non protégée,
       l'utiliser à la place.

  Aucun fichier n'a été écrit. Code de sortie : 1.
```

**Implémentation** :
- Ajouter `src/exporter/anti-bot.ts` avec `detectCloudflare(html, status, headers)`, `detectCaptcha(page)`.
- `capture.ts` appelle ces détections après le SSR fetch ET après le `page.goto()`.
- Si détection positive : throw `AntiBotError` avec `{platform, type, url}`.
- `cli/index.ts` catch `AntiBotError` → affiche le message ci-dessus + exit 1.
- Aucun fichier output n'est créé en cas d'erreur (cleanup du dossier temp).

**Mode stealth optionnel** :
- Flag CLI `--stealth` active le chargement de `puppeteer-extra-plugin-stealth` (dépendance optionnelle, installée par l'user à la demande).
- Si flag présent mais lib absente : message d'aide pour installer.

---

## 7. Plan d'exécution

Ce spec est consommé par la skill `superpowers:writing-plans` qui produira un plan d'implémentation détaillé. L'exécution se fera ensuite via `superpowers:executing-plans`, **phase par phase**, en respectant le rituel de validation pixel-perfect par plateforme.

À chaque fin de phase :
- Tag git de la version.
- Push de la branche.
- Update `package.json` `version`.
- Update `README.md` avec les nouvelles plateformes supportées.

---

## 8. Décisions ouvertes (à confirmer en planning)

- [ ] Stealth plugin Puppeteer en dépendance optionnelle (lazy require) ou directe ?
- [ ] `pixelmatch` activé dès Phase 0 ou uniquement après Phase 6 ?
- [ ] Branche unique `v5` ou une branche par phase ?
- [ ] Notion : conserver l'interactivité (clics, expand) ou export "snapshot statique" pur ?

Ces points seront résolus pendant `writing-plans`.
