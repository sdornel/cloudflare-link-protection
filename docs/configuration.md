# Content, styling, and private configuration

## Standalone example versus the real page

`example.html` is a fixed, standalone preview with embedded CSS. Open it directly in a browser. It does not load JSON, import a stylesheet, run scripts, or depend on the build system. Ordinary builds leave it unchanged. The explicit `npm run example:refresh` command regenerates it from the neutral sample, shared renderer, and theme.

`src/index.html` is the configurable page template, not a ready-to-open page. A normal build turns it into `dist/index.html`, selecting `SITE_CONFIG_JSON` first, then `config/site.json` if it exists, then the neutral `config/site.example.json`. Configuration is applied at build time, so the deployed page needs no runtime JSON request. The raw config is not copied to the output.

To create your own page:

1. Copy `config/site.example.json` to `config/site.json` if you do not already have a private config.
2. Edit the copy's content, destinations, appearance, and optional `styles` overrides.
3. Run `npm run build`, then open `dist/index.html` (or run `npm run dev` for a local server).
4. Rebuild after editing. For Cloudflare, provide the same JSON in the production-only `SITE_CONFIG_JSON` build variable.

The checked-in sample must remain neutral and contain no real deployment identity, destination links, personal images, or analytics token. `example.html` is also included in the public-source audit. Neither regular nor private builds rewrite it or automatically include it in deployed output.

## Site configuration

`config/site.example.json` is the public example. `config/site.json` is the ignored, complete config for another deployment. Do not put personal deployment data in the public example.

The directory should look like this:

```text
config/
  site.example.json   # committed neutral sample
  site.json           # optional local settings; ignored, overrides the sample
  theme.json          # committed default theme
```

Create `config/site.json` by copying the sample on a fresh clone; do not overwrite an existing config. `npm run build` reads it unless `SITE_CONFIG_JSON` is set. If neither is available, the sample is used. Malformed JSON, invalid settings, or an unreadable file fail the build; only a missing file triggers the fallback. An explicitly set empty or invalid environment variable also fails instead of falling back.

`npm run build:example` always uses the sample and ignores both private inputs. It writes to the same `dist/` directory, so run `npm run build` again to return to your configured page. `example.html` is independent of all these commands. The optional `npm run build:private` requires customized input and writes `dist-private/`; it never falls back to the sample. On Cloudflare, supply the full JSON through the encrypted production build variable because the ignored file is absent from the Git checkout.

| Field | Meaning |
| --- | --- |
| `name`, `bio`, `description` | Visible identity and page description |
| `siteUrl` | Final HTTPS origin; empty for the demo |
| `placeholderLinks` | Keeps unfinished sites out of search indexing and shows `previewNote` |
| `profile.initials`, `profile.image`, `profile.alt` | Monogram or portrait and alternative text |
| `primaryLink` | `label`, direct HTTPS `url`, and `icon` |
| `secondaryLinks` | Same link fields plus `enabled` |
| `previewNote` | Optional text while placeholder mode is enabled |
| `seo` | `title`, optional `image`, and `imageAlt` |
| `analytics.cloudflareToken` | Optional public Web Analytics site token |
| `appearance` | Browser theme color, color scheme, favicon colors |
| `styles` | Overrides to the shared `config/theme.json` |

Icons are `none`, `arrow`, or `heart`. Links are general HTTPS destinations, with no platform-specific code. To use a final site, replace example links, set `siteUrl`, and set `placeholderLinks: false`. The production build rejects an unset origin or placeholder mode; it cannot verify ownership or availability of destinations.

## Styling

All CSS for the configurable page lives in `config/theme.json`. The standalone `example.html` embeds a neutral snapshot produced by the same renderer; refresh it explicitly after changing the shared theme. Theme sections are:

- `variables`: reusable CSS custom properties; keys omit the leading `--`.
- `rules`: selectors mapped to ordinary CSS declarations, using kebab-case property names.
- `media`: media queries mapped to selector/declaration objects.
- `keyframes`: animation names mapped to keyframe/declaration objects.

Change the shared file for a new public default. For a private design, put only the differences in that site's `styles` field. These are merged recursively; `null` removes an inherited property, rule, query, or animation.

For example, this `styles` object changes color, typography, layout, button shape, mobile spacing, and motion:

```json
{
  "variables": {
    "accent": "#245c50",
    "accent-hover": "#194337",
    "font-family": "Georgia, serif",
    "primary-shadow": "none"
  },
  "rules": {
    ".page": { "width": "min(100%, 560px)", "padding-top": "48px" },
    ".link": { "border-radius": "12px", "min-height": "64px" },
    ".avatar": { "border-radius": "24px" }
  },
  "media": {
    "(max-width: 350px)": { ".page": { "padding-inline": "12px" } },
    "(prefers-reduced-motion: no-preference)": { ".page": { "animation": "none" } }
  }
}
```

CSS values must be strings. Gradients, `clamp`, `calc`, shadows, and system font stacks work. External CSS, imports, and `url()` values are intentionally unsupported; use the image fields for portraits and sharing images. Browsers still determine whether a particular CSS property/value is supported. Config validation is not a full CSS grammar validator.

Keep reduced-motion and keyboard-focus rules intact unless you provide accessible replacements. Recheck contrast and touch-target size after changing the theme. Browser chrome and favicon colors are in `appearance`; align them with your theme. Icon vector geometry and HTML structure remain implementation details.

## Images

For the public demo, `/images/portrait.webp` reads `public/images/portrait.webp`. That directory is public source: only put assets intended for the repository there.

When the selected config comes from `config/site.json` or `SITE_CONFIG_JSON`, the same path reads `.private/assets/portrait.webp`. Only referenced images are copied into `dist/images/` (or `dist-private/images/` with `build:private`); unrelated files and configuration are never copied. Supported local formats: WebP, AVIF, PNG, JPEG. Use a compact square portrait, and optionally a separate sharing image.

Cloudflare cannot read ignored files from your computer. For Git-backed private builds, use an HTTPS image URL hosted outside this repository, or leave the monogram. The build permits each configured image origin in the page's CSP. The URL must be publicly readable by visitors; it is not a secret file URL. It also results in a visitor request to that image host. No automatic image download/upload service is included.

## Before publishing the repository

1. Keep real page settings in ignored `config/site.json`, and private assets and notes in `.private/`. Keep both output folders, ZIPs, local environment files, and credentials out of Git.
2. Run `npm test`, `npm run build:example`, and `npm run check:public`. Build output stays ignored even when `npm run build` uses your local settings.
3. Review `git diff --cached` and `git ls-files` before pushing. The check reports when Git is unavailable and only the known source folders were inspected.
4. Check commit history, README screenshots, issue text, release assets, and Pages deployment/check links before making an existing repository public. `.gitignore` does not remove previously committed content or hide prior history.

For a repository that already contains private configuration, start with a clean public repository or remove the sensitive history before changing visibility. The project does not rewrite repository history automatically.

A customized Pages project connected to a public repo may expose its deployment URL through GitHub checks even though its input config is encrypted. If keeping that association private matters, build locally from this same repository and upload the output manually instead. The source/config separation alone does not guarantee anonymity.

For additional case-insensitive keyword checks, put an array of strings in `.private/audit-terms.json`. Keep that file ignored too: your exclusion terms can reveal the very associations you want to keep out of public source. The checker reports the affected source file without printing the matched private value.

## Browser features and schema

The [schema](../config/site.schema.json) supplies editor hints; the build additionally checks safe CSS, real image paths, complete HTTPS URLs, generated ID uniqueness, and production readiness. Add `"$schema": "./site.schema.json"` to your local config for editor completion. Schema versions 1 and 2 are accepted; missing version means legacy. New feature blocks are optional on either version.

| Option | Default / behavior |
| --- | --- |
| `browserOpening.mode` | `direct` when omitted; `native` enables supported mobile assistance |
| `browserOpening.autoOpen` | `false`; experimental one-time iOS page handoff |
| `browserOpening.showManual` | `true`; shown only in eligible native contexts |
| `browserOpening.iosStrategy` | `instagram`; optional `safari` alternative |
| `browserOpening.androidPackage` | `com.android.chrome`; validate installed-browser behavior before changing |
| `browserOpening.fallbackDelayMs` | `1800`; integer 800–5000, used only to show unconfirmed-attempt help |
| `browserOpening.labels` | Optional plain-text `open`, `retry`, `continue`, `dismiss`, `pending`, `unconfirmed`, `iosInstructions`, `androidInstructions` |
| Link `id` | Unique lowercase letters/digits/underscores/hyphens, 1–40 characters; positional default if absent |
| Link `openingMode` | `inherit`, `direct`, or `native` |
| `ageAcknowledgment.enabled` | `false` |
| `ageAcknowledgment.message` | Configurable plain-text notice |
| `ageAcknowledgment.remember` | `session` or `none`; default `session` |
| `analytics.ga4MeasurementId` | Empty by default; optional `G-…` public identifier |
| `analytics.ga4Consent` | `required` by default; `granted` is an explicit operator policy choice |
| `analytics.debug` | `false`; local event logging without raw URLs |

IDs are analytics labels: use generic values such as `projects`, never customer identifiers or secrets. All actual destinations remain public hrefs. No Bouncy-specific mode exists; use a service URL as an ordinary destination if needed.

The 18+ feature is a self-attestation notice, not identity verification or restricted access. With JavaScript, an acknowledgment precedes enhanced navigation and remembers only a boolean. Without scripts, the notice and ordinary links remain available. An external browser has separate storage and can ask again.

Normal builds compile selected options into small public runtime settings; they do not publish the original JSON. An old config with no new feature blocks produces the original direct-link behavior.
