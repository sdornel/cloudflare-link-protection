# Architecture decisions

## Static generation and progressive enhancement

A dependency-free Node build validates configuration, compiles JSON styling, renders HTML, and copies only referenced images. With verification disabled, static output also works on Pages or an ordinary static host. The optional branded gate requires the shared Cloudflare Worker. No database or framework hydration is needed. Generation needs no installed packages; Workers deployment uses the pinned Wrangler development dependency.

The client never fetches `site.json`. The renderer emits an explicit allowlist of public feature settings in escaped inert JSON. Arbitrary operator metadata stays out of the output. Real anchor hrefs exist before JavaScript executes; an optional module can enhance a click but cannot become the only route to its destination. The example's buttons use the exact built-in `/example/more-soon/` route; this sole local destination exception requires placeholder mode and always navigates directly. The placeholder page shares the neutral example stylesheet and has no client scripts.

## Strategy decisions versus browser effects

`browser-context.js` classifies a limited supported context. `browser-opening.js` constructs plans without DOM access. `handoff-controller.js` executes plans, guards automatic attempts, and handles visibility/timers. `app.js` owns UI wiring. A future scheme change should normally affect the strategy module and its tests, not profile rendering.

The controller reports attempted, observed-hidden, returned, unconfirmed, and fallback states. It cannot observe another browser's page load, so it never invents a successful-handoff result. Analytics uses a bounded event vocabulary and isolates adapter failures from navigation.

## One renderer, two demonstrations

Normal/strict builds and the served neutral demo share `renderPage`. `example:refresh` also calls that renderer but disables runtime features and embeds the generated CSS. The resulting root `example.html` is a portable layout demonstration. Standard builds never modify it.

Client modules are emitted under a content-hashed directory. Changing any module changes the entry path and all relative imports together, avoiding mixed-version caches. All configurable styling, including assistance controls, remains in the JSON theme.

## Source separation

Every build generates the neutral profile demo at `/example/`. Sample and non-root profile builds generate a distinct platform landing at `/`; `scripts/landing.mjs` renders its template using independent content/theme defaults and optional private `landing` overrides. Legacy root-profile configs retain their behavior. The build compiles and validates all pages before replacing output. Each page has its own asset directory; root robots, sitemap, 404, and security headers are generated once. The CSP combines the image/analytics origins needed by generated pages without loading one page's integrations on another. The homepage has no client scripts or creator directory. The preview server resolves directory indexes; Workers uses its default HTML routing after any verification check. Page rendering adds no client-side config lookup, SPA fallback, or tenant database; Worker metadata is described below.

A public sample supports a fresh clone. Ignored local config or a production-only environment variable supplies a deployed identity. An explicit example build ignores both private inputs. Separate Workers consume the same application source with separate settings. This separates source data; it does not make rendered information secret.

The public audit checks selected source roots and Git paths when available. It permits the generic supported platform name as a link label, while still checking private identities, exact destination URLs, verification copy, and operator exclusion terms. It is not an image-content scanner or a replacement for reviewing Git history and screenshots.

## Optional verification boundary

`scripts/verification.mjs` compiles the gate's escaped template, profile theme plus verification overrides, and minimal runtime metadata. Every build emits `/_verification/manifest.json`; disabled builds contain only version, disabled status, and security headers. The Worker fetches this internally through `ASSETS` and blocks public access. Enabled metadata contains only the selected origin/path, public asset allowlist, session duration, and gate UI; it never contains outbound links or runtime credentials.

`src/worker/index.js` runs before static serving. It validates a signed session before returning protected profile HTML, including direct index paths, and adds response security/cache headers itself. `session.js` owns HMAC signatures, host/profile binding, cookie parsing, and expiry. The gate client only loads Turnstile and submits its token to a same-origin endpoint. Siteverify validates hostname/action and a nonce carried in a signed challenge cookie; failures do not expose links. The session lasts for the configured duration and is separate from Cloudflare clearance.

The plain preview server refuses gated builds. Automated tests inject a synthetic Siteverify service into the Worker factory; the deployed entry always uses Cloudflare's actual endpoint and rejects official test credentials. Credential activation, WAF interaction, quota implications, real-device checks, and rollback are documented in [verification](verification.md). This adds optional server enforcement without changing the profile renderer or native-browser strategies.
