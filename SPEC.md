# Static Profile Page — specification

## Purpose

Provide a lightweight, mobile-first profile and links page that can be used as a public software-engineering portfolio project and as the engine for separately configured deployments. Keep implementation simple, fast, self-hostable, and free of paid dependencies.

The source repository is intended to be public. Its demo, documentation, tests, and examples must remain neutral. Deployment-specific identity, destinations, imagery, branding, and operating notes must remain outside the public source.

## Page behavior

- Render a profile photo or initials, name, short bio, one prominent primary link, smaller secondary links, and a footer.
- Use the exact labels, ordering, URLs, and selected icons from configuration. Do not derive labels from destination platforms.
- Use ordinary, clickable, same-tab HTTPS anchors. Links must work without JavaScript and without waiting for analytics.
- Support working placeholder URLs while a deployment is being prepared. Show configurable preview copy and `noindex, follow` while `placeholderLinks` is true.
- Allow individual secondary links to be disabled. Do not render disabled links.
- Deliver the same content to human visitors and automated reviewers for a given deployment. Do not change content based on user-agent, referrer, or IP.
- Do not implement automatic outbound redirects, destination cloaking, popup windows, hidden link reveals, or forced browser switching.

The public example uses a neutral identity and example-domain destinations. Specific live destinations are supplied by a deployment's private config.

## Standalone default example and sample config

- Commit a root `example.html` that demonstrates a complete, neutral default appearance.
- It must open directly from disk with embedded styling and working example-domain links, without a build step, configuration reads, imported stylesheets, scripts, or external assets.
- It must remain independent of both public and private config changes. Builds must not rewrite it using deployment data.
- Commit an explicitly named `config/site.example.json` containing an innocent, neutral sample: generic portfolio content, example-domain destinations, no personal images, and an empty analytics token.
- Document `src/index.html` as the actual configurable template and the generated `index.html` as the deployment entry point. Apply configuration at build time; do not expose raw JSON through a browser-side fetch.
- Document copying the sample to ignored `config/site.json`, customizing that copy, building the private page, and supplying the same configuration as a Cloudflare production build variable.
- Include the standalone example in the publication audit. Do not automatically copy it into public or private deployment output.

## Configuration and styling

Public content lives in `config/site.example.json`. The full page stylesheet is represented by `config/theme.json`, with four sections:

| Section | Required behavior |
| --- | --- |
| `variables` | Reusable CSS values, including palette, fonts, gradients, and shadows |
| `rules` | Selector/declaration objects for layout, size, spacing, alignment, borders, typography, hover/focus states, and other page CSS |
| `media` | Configurable breakpoints, responsive overrides, hover capability, reduced motion, and forced-color rules |
| `keyframes` | Configurable animation steps |

A site's `styles` object recursively overrides the shared theme. Unspecified values inherit; `null` removes an inherited entry. Generate one external stylesheet at build time. The configurable page must not depend on a separate hand-maintained stylesheet with fixed visual choices. The standalone `example.html` is an intentional exception: it embeds a fixed, neutral default design so it can open without configuration.

Support system-font stacks, gradients, shadows, CSS functions, responsive rules, and optional subtle motion. Reject imports, remote CSS loads, statement injection, and prototype-polluting keys. This is a declarative CSS configuration format, not an unrestricted CSS parser or visual editor.

Browser theme color, color scheme, and favicon colors belong to `appearance`. Icon selection belongs to each link (`none`, `arrow`, or `heart`). The semantic HTML structure and built-in vector path geometry remain implementation details.

## Public and private builds

| Command | Configuration | Output |
| --- | --- | --- |
| `npm run build` | Public example only | `dist/` |
| `npm run build:production` | Public example with production checks | `dist/` |
| `npm run build:private` | Private environment input or ignored local config | `dist-private/` |
| `npm run build:private:production` | Private input with production checks | `dist-private/` |

- Public builds must ignore private local files and `SITE_CONFIG_JSON`, even if the variable is present or malformed.
- Local private builds prefer `SITE_CONFIG_JSON` when set; otherwise read `config/site.json`. An explicitly set empty or invalid variable is an error, not a reason to fall back.
- Private content must be supplied as a complete site config. Theme overrides may be partial.
- Missing or invalid private configuration must fail the build without silently publishing the neutral demo.
- On Cloudflare, private builds require `SITE_CONFIG_JSON` and the production branch. Read `CF_PAGES_BRANCH`; compare it with `SITE_PRODUCTION_BRANCH`, defaulting to `main`. Do not use a local-file fallback on Cloudflare.
- Production checks require a configured HTTPS origin and `placeholderLinks: false`. Operators remain responsible for replacing placeholders and verifying ownership and reachability of destinations.
- Do not print raw private JSON, destination values, or parser excerpts in build errors. Report the affected field or configuration source.
- Generate public and private output in separate directories to reduce accidental publication of the wrong build.

Private inputs are private **source data**, not secret website content. Rendered names, destinations, images, styles, and analytics site tokens are visible on the deployed site. Do not put API credentials into display configuration.

## Images and output isolation

- Use a monogram when no portrait is configured.
- Public local image paths resolve under `public/images/`; private local image paths resolve under `.private/assets/`.
- Support local WebP, AVIF, PNG, and JPEG files, with descriptive alternative text.
- Copy only explicitly referenced image assets into output. Never copy an entire private folder, raw config, unrelated files, or operating notes.
- Reject path traversal, missing assets, and symlinks escaping the selected asset directory.
- Allow externally hosted HTTPS images for builds where local private files are unavailable. Add only their configured origins to `img-src`; do not use a wildcard allowance.
- A Git-backed Cloudflare build cannot read ignored files from a developer's computer. Use external image URLs or a monogram, or build locally and upload the generated output.

## Repository publication

The public repository must contain the generic implementation, neutral examples, tests, and deployment documentation. It must not contain deployment-specific names, links, photos, descriptions, analytics tokens, or operating notes.

`.gitignore` must exclude `site.json` (including `config/site.json`), `.private/`, legacy local site config, generated output, ZIP archives, dependencies, logs, local environment variables, credentials, and local tool state. Keep `config/site.example.json` tracked. Document that real local settings belong in `config/site.json`, beside the sample. Public source exports must omit the real file even though its directory also contains tracked files. Public files must not expose private associations through project names or documentation examples.

`npm run check:public` must:

1. Inspect the explicit public source roots, rejecting unexpected private/generated paths and source symlinks.
2. Inspect tracked paths when a usable Git index is available, including files force-added despite ignore rules.
3. Compare public source against available private display fields, excluding values intentionally shared with the public example.
4. Check optional case-insensitive exclusion terms in the ignored `.private/audit-terms.json` file.
5. Report failures without printing matched private values, and clearly report when Git or private comparison inputs are unavailable.

The audit is a publication guard, not an exhaustive secret scanner or history scrubber. Before making an existing repository public, review its history, screenshots, issues, artifacts, and deployment checks. Ignore rules do not remove previously committed data. Do not change repository visibility or publish files without the user's authorization for that destination.

## Cloudflare deployment and security

- Deploy static output to Cloudflare Pages using the free tier; support a dedicated custom domain and HTTPS.
- Support Git-backed builds from the public repository. Use a separate Pages project for the neutral demo and customized site.
- Supply private JSON as an encrypted, production-only build variable. Keep it out of public CI variables and artifacts. Disable automatic preview builds on the private project.
- Document that public GitHub deployment checks may reveal the customized site's URL. Source/config separation does not guarantee anonymity or conceal the relationship between sites. Use separate private deployment infrastructure if that association must remain private.
- Include browser security headers: CSP, MIME-sniffing prevention, framing restrictions, referrer policy, and restricted unused browser capabilities.
- Document free WAF defaults, Browser Integrity Check, targeted Managed Challenges, and optional temporary site-wide challenges through Cloudflare's dashboard.
- Keep routine public access low-friction. Explain that broad challenges can disrupt embedded browsers and automated reviews, and are not a guarantee of platform-policy compliance.
- Explain that custom-zone WAF rules do not protect the separate `pages.dev` endpoint. A static public page is not an authenticated content store.

Cloudflare account configuration, GitHub application access, DNS changes, domain registration, and live deployment are external setup steps. Local builds must not claim these actions have happened automatically.

## Performance, accessibility, SEO, and analytics

- Use a minimal static stack, Node.js 22 or newer for the build, and no required package installation or paid service.
- Keep essential page rendering and navigation independent of JavaScript and remote fonts.
- Provide responsive layout, large touch targets, visible keyboard focus, a skip link, meaningful alternative text, reduced-motion support, and accessible default text contrast.
- Generate description metadata, Open Graph sharing metadata, canonical URLs and a sitemap when configured, a permissive robots file, and a true 404 page.
- Make Cloudflare Web Analytics optional. Support either automatic dashboard injection or one deferred manual beacon, with the necessary CSP permissions.
- Do not claim the basic analytics integration measures custom click events or purchases. It provides the capabilities documented by the analytics provider.

## Acceptance and verification

Both public and private builds must succeed with valid input. Tests must cover private-input isolation, missing/invalid configuration, sanitized errors, branch restrictions, direct links, HTML escaping, theme overrides and rejection cases, selective image copying, path safety, SEO output, analytics opt-in, and default contrast.

Verify that `example.html` has no configuration or asset-loading dependency, uses neutral placeholder links, and remains unchanged after configured private builds. The public source audit must include the standalone example and sample JSON.

Publication checks must pass before source export or upload. Tests that require unavailable host capabilities must report that limitation explicitly. Browser layout, mobile in-app behavior, HTTPS, WAF, and live analytics require appropriate browser or deployment verification; automated build tests alone do not establish them.

No login system, database, runtime admin panel, paid tracker, URL shortener, platform API integration, or bot-evasion mechanism is required by this specification.
