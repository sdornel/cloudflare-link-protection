# Static Profile Page

A configurable, mobile-first profile and links page built with HTML and a dependency-free Node.js generator. Its public demo is a neutral portfolio. Separate build modes let the same code power a customized site without committing its identity, destinations, or images to the source repository.

See [SPEC.md](SPEC.md) for required behavior, configuration boundaries, publication rules, and acceptance criteria.

## Open the default example

Double-click [example.html](example.html). It is a standalone, neutral portfolio example with its own embedded styling and working example-domain buttons. It needs no config, server, JavaScript, dependencies, or build step. You can copy that one file elsewhere and open it.

`example.html` is a fixed reference. Changing a config or building a private site does not modify it. It is safe to commit alongside the innocent sample [config/site.example.json](config/site.example.json).

## Build the configurable index.html

The actual page uses [src/index.html](src/index.html) as its template. A build reads a selected configuration and generates `index.html` with the content and styles already included in static files. The browser does not fetch or receive the raw JSON configuration.

Node.js 22 or newer is the only prerequisite. No package installation is needed.

```sh
npm run build
npm run dev
```

These commands build the checked-in neutral sample into `dist/index.html` and serve it at **http://localhost:4173**. You can also open that generated file directly. Rebuild and refresh after changes.

## Configure everything

| File | Purpose | Commit? |
| --- | --- | --- |
| `example.html` | Standalone default appearance, independent of every config | Yes |
| `config/site.example.json` | Neutral demo content, links, metadata, and browser appearance | Yes |
| `config/theme.json` | All page CSS: variables, selectors, responsive rules, animations | Yes |
| `config/site.json` | Your deployment's full content and style overrides | No |
| `.private/assets/` | Your local deployment images | No |
| `dist/`, `dist-private/` | Generated public/private site files | No |

For the configurable `index.html`, the theme compiler turns JSON into one static stylesheet. Its page styling stays in configuration. The standalone `example.html` deliberately embeds its own fixed styling so it opens independently. See [configuration and styling](docs/configuration.md) for layout, color, typography, border, spacing, animation, and responsive examples.

To configure your own `index.html`, copy `config/site.example.json` to `config/site.json` if that file does not already exist. Edit the ignored copy with your name, links, images, and appearance; preserve an existing private configuration. Content is required in full, and `styles` may selectively override the shared theme. A private build never silently falls back to the sample.

**The real file belongs at `config/site.json`, next to `config/site.example.json`.** `site.json` is ignored by Git; the example file is committed. On a fresh clone, create the local file without overwriting existing settings:

```sh
cp -n config/site.example.json config/site.json
```

```sh
npm run build:private
npm run dev:private
```

Open `dist-private/index.html` directly, or use the local server. Public builds ignore `config/site.json` and `SITE_CONFIG_JSON`, even when present. Private builds read `SITE_CONFIG_JSON` first, then the ignored `config/site.json`. Cloudflare private builds require the variable and the configured production branch because Git does not upload your real config.

Commit the example HTML, sample JSON, theme, template, and application code. Keep your real config and generated `index.html` out of Git. Deploy only the selected build output; the root `example.html` is not copied into either deployment automatically.

## Cloudflare Pages

Connect this public GitHub repository to Pages. Choose framework **None**, Node.js **22**, and one of these setups:

| Site | Build command | Output | Build variables |
| --- | --- | --- | --- |
| Public portfolio demo | `npm run build` | `dist` | None |
| Customized demo | `npm run build:private` | `dist-private` | Production-only `SITE_CONFIG_JSON` |
| Configured live site | `npm run build:private:production` | `dist-private` | Production-only `SITE_CONFIG_JSON` |

Use separate Pages projects for the public demo and customized deployment. Keep private input out of public repository variables, build logs, issues, screenshots, and CI artifacts. Disable preview builds on the private project. Full instructions: [Cloudflare setup](docs/cloudflare.md), [security](docs/security.md), and [analytics](docs/analytics.md).

**Private configuration means private source inputs.** The rendered name, links, images, colors, and analytics site token are visible on the deployed website. This design does not conceal destinations or prevent someone from associating two sites that share a template. Never put API credentials in display configuration.

## Engineering choices

- No runtime framework, client-side hydration, database, or install-time dependencies.
- Direct HTTPS links work without JavaScript. The optional analytics beacon is the only visitor script.
- Separate public and private output directories reduce accidental publication of the wrong build.
- Declarative styles support responsive rules and animations while rejecting stylesheet injection and remote CSS loads.
- Text is escaped, URLs validated, and only referenced image files are copied. Symlinks cannot escape the chosen asset directory.
- Canonical/Open Graph metadata, a sitemap for configured sites, a real 404 page, CSP, and accessible defaults are generated.
- Tests cover config isolation, redacted errors, theme overrides, assets, production checks, links, and contrast.

```sh
npm test
npm run check:public
```

The publication check audits tracked paths when Git is initialized and checks known source files against local private identity values when available. It is a useful guard, not a complete secret scanner or Git history scrubber. See [publication checks](docs/configuration.md#before-publishing-the-repository).

`private: true` in `package.json` prevents accidental npm package publication; it does not make a GitHub repository private. The site has no paid dependencies. Domain registration remains separate from hosting.
# cloudflare-link-protection
