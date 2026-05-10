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

1. Les 3 plateformes existantes (Framer, Webflow, Wix) ne régressent pas — détection et export identiques à v4.
2. Chaque nouvelle plateforme a un handler avec : détection, strip badges, asset mapping, sub-pages support.
3. Pour chaque plateforme : un export d'un site réel, servi via `serve.js`, est visuellement fidèle (≥99.5% de similarité pixel ou inspection manuelle validée).
4. CLI permet de chercher/sélectionner parmi 28 plateformes sans friction.
5. Release incrémentale : une phase = une version mineure ; jamais de plateforme à moitié supportée.

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

## 5. Recherche de signatures par plateforme

Avant d'écrire chaque handler, le workflow est :

1. **firecrawl** sur un site exemple → HTML + screenshot.
2. **Inspect** :
   - Hosting domain (`*.platform.com`)
   - `<meta name="generator">`
   - Classes CSS/IDs uniques
   - CDN d'assets
   - Globals JS (`window.Shopify`, `window.__NEXT_DATA__`, `window.Notion`)
   - Scripts d'analytics par défaut (à strip)
   - Badge "Made with …" (sélecteur, pattern HTML)
3. **Context7** si SDK doc disponible (Shopify Liquid, Notion API, Ghost API, WordPress REST).
4. **Construction** du handler à partir de ces signatures.

### 5.1 Notes par plateforme à risque

- **Notion** — page React hydratée, pas de SSR utile. Solution : capturer le DOM final via Puppeteer (`document.documentElement.outerHTML` après hydration), ne pas utiliser le SSR fetch. Ajouter `postProcess` qui inline les CSS Notion.
- **Shopify** — beaucoup de custom domains, anti-bot Cloudflare possible. Détection : `window.Shopify`, `cdn.shopify.com`. Si Cloudflare bloque : ajouter `puppeteer-extra-plugin-stealth` (dépendance optionnelle, lazy load).
- **WordPress** — détection via `<meta name="generator" content="WordPress …">` ou `wp-content/`/`wp-includes/`. Custom domains majoritaires. Priorité basse (25) car beaucoup d'autres handlers peuvent matcher avant si actifs.
- **Elementor** — posé sur WordPress. Détection : `data-elementor-*`, `body class="elementor-…"`. v5.2 = handler dédié qui surcharge WordPress. v5 ne va pas jusqu'à reconstituer Elementor à 100%, juste strip badge + assets.
- **Gamma** — slides animées. v5.6 capture la slide 1 (page d'entrée publique) ; sub-pages = autres slides via `?card=N` éventuellement.
- **Bubble** — apps Bubble lourdes en JS. Hydration longue (`hydrationTimeout: 8000`). Strip `bubble.io` analytics.
- **Squarespace** — domaines custom dominants, détection via `static1.squarespace.com` + `<meta name="generator" content="Squarespace …">`.

---

## 6. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Régression sur Framer/Webflow/Wix | Phase 0 isolée, tests de détection sur fixtures, validation manuelle des 3 sites de référence avant de tag v5.0.0-alpha. |
| Détection multi-match (ex. WP + plugin) | Champ `priority`, ordre déterministe, test fixtures. |
| Anti-bot (Cloudflare, captchas) | Stealth plugin optionnel pour Shopify et autres. Si captcha hard : skip et noter dans le report. |
| Pixel-diff faux positifs (fonts, anti-aliasing) | Seuil 0.5%, fallback inspection manuelle. |
| Plateformes qui changent leurs signatures | Tests fixtures cassent en CI → on update au cas par cas. Versioning tolérant. |
| Scope creep (tentation auth-gated) | NON-OBJECTIF formel dans ce spec. Reporter à v6. |

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
