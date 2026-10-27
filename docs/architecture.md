# Architecture decisions

## Static generation and progressive enhancement

A dependency-free Node build validates configuration, compiles JSON styling, renders HTML, and copies only referenced images. The static output works on Pages or an ordinary static host. There is no database, runtime server, framework hydration, or dependency installation in the production build.

The client never fetches `site.json`. The renderer emits an explicit allowlist of public feature settings in escaped inert JSON. Arbitrary operator metadata stays out of the output. Real anchor hrefs exist before JavaScript executes; an optional module can enhance a click but cannot become the only route to its destination.

## Strategy decisions versus browser effects

`browser-context.js` classifies a limited supported context. `browser-opening.js` constructs plans without DOM access. `handoff-controller.js` executes plans, guards automatic attempts, and handles visibility/timers. `app.js` owns UI wiring. A future scheme change should normally affect the strategy module and its tests, not profile rendering.

The controller reports attempted, observed-hidden, returned, unconfirmed, and fallback states. It cannot observe another browser's page load, so it never invents a successful-handoff result. Analytics uses a bounded event vocabulary and isolates adapter failures from navigation.

## One renderer, two demonstrations

Normal/strict builds and the served neutral demo share `renderPage`. `example:refresh` also calls that renderer but disables runtime features and embeds the generated CSS. The resulting root `example.html` is a portable layout demonstration. Standard builds never modify it.

Client modules are emitted under a content-hashed directory. Changing any module changes the entry path and all relative imports together, avoiding mixed-version caches. All configurable styling, including assistance controls, remains in the JSON theme.

## Source separation

A public sample supports a fresh clone. Ignored local config or a production-only environment variable supplies a deployed identity. An explicit example build ignores both private inputs. Separate Pages projects consume the same application source with separate settings. This separates source data; it does not make rendered information secret.

The public audit checks selected source roots and Git paths when available. It permits the generic supported platform name as a link label, while still checking private identities, exact destination URLs, and operator exclusion terms. It is not an image-content scanner or a replacement for reviewing Git history and screenshots.
