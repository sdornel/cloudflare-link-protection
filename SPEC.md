# Static Profile Platform — authoritative specification

**Status:** Expanded specification for review; planned behavior is not a claim of implementation or verification.

**Research and code inspection:** 2026-10-26.

**Inspected baseline:** `caadb10` and the working tree at the start of this expansion. Baseline descriptions below refer to that inspection.

**Workflow:** This update expands the existing specification only. Do not implement features, restructure files, install dependencies, change deployment settings, or modify application code as part of this task.

This document is the implementation reference. Keep it synchronized with architectural decisions and distinguish implemented behavior, proposed behavior, and device-verified behavior. Existing documentation describes the earlier application until implementation updates it.

## 1. Objective and boundaries

Build an open-source, self-hosted creator links platform suitable for production use and a public software-engineering portfolio. Preserve the polished landing page and native, best-effort external-browser opening from Instagram's in-app browser, with Bouncy.ai as an optional provider. It must support a publicly accessible neutral demo and multiple independently configured production creator websites from **one public GitHub repository**. Production readiness requires the documented validation and deployment checks; this specification does not claim the planned features are already implemented or verified.

Priority order:

1. Reliability and preservation of working links and existing configurations.
2. Low visitor friction and clear, prominent calls to action.
3. Clean architecture and configuration-driven behavior.
4. Independent hosting without mandatory subscriptions.
5. Maintainable browser strategies that can change as mobile platforms change.
6. Portfolio-quality documentation, verification, and reproducible demonstrations.

### Scope decisions

- Preserve native external-browser handoff in our own code and add optional Bouncy.ai handoff using operator-supplied HTTPS links. The primary website must remain fully functional without Bouncy, its account, or any paid subscription; no Bouncy SDK, API integration, or link-provisioning backend is required.
- Supported browser-opening modes are `direct`, `native`, and optional `bouncy`. The current expansion supersedes the earlier Bouncy exclusion and two-mode restriction; existing direct/native configurations keep their meaning.
- Use static HTML/CSS and small JavaScript modules, with a dependency-free Node.js build. No required server, database, runtime framework, login, dashboard, or link-shortening service.
- Use Cloudflare Pages Free as the documented hosting target, without making the generated output Cloudflare-dependent. Domain registration is a separate cost.
- Keep the reusable application, configuration schema, neutral examples, documentation, and deployment tooling together in the public repository. A separate private repository needs a concrete, documented technical or security justification; none is currently required.
- Keep deployment identity, real destinations, images, production configuration, and operating notes out of GitHub. The resulting public website necessarily exposes displayed content and destinations.
- Technical documentation may name supported browsers and platforms. Such compatibility references are distinct from deployment-specific names, handles, URLs, labels, or imagery.
- Do not add crawler targeting, deceptive destinations, fingerprinting, content switching for reviewers, or claims that a browser handoff prevents platform moderation.
- The public-facing bio URL points to the operator's own domain and displays the actual landing page. Do not turn the root page into a redirect-only intermediary.

### Required functionality and optional enhancements

| Category | Requirement |
| --- | --- |
| Required platform | Complete static links page; backward-compatible configuration; independently branded deployments; one shared renderer; accessible, responsive, performant defaults; public demo and portfolio documentation |
| Required hosting support | Cloudflare Pages Free deployment, custom domains, HTTPS, and documented WAF/Managed Challenge configuration separate from application behavior |
| Configurable enhancements | Native and Bouncy handoff, age acknowledgment, Cloudflare analytics, and GA4 can each be disabled; their specified validation and fallbacks remain required when supported |
| Optional operations | Staging sites, third-party accounts, analytics collection, stronger browser verification, and paid hosting/provider upgrades are not prerequisites for the core website |
| Experimental behavior | Automatic native iOS handoff and undocumented schemes remain opt-in and device-dependent; neither native nor Bouncy handoff guarantees browser escape or conversion gains |

Optional means operators choose whether to enable the enhancement. The core page and direct links must work with every enhancement disabled. The public demo and production sites use the same implementation; their content and enabled features come from configuration.

## 2. Inspected baseline and required changes

| Area | Existing implementation | Intended change |
| --- | --- | --- |
| Rendering | `scripts/build.mjs` fills `src/index.html` with validated data; links are static HTTPS anchors | Preserve server-independent rendering; add small progressive enhancements |
| Config selection | Environment JSON, otherwise ignored local `config/site.json`, otherwise committed sample | Preserve exact precedence and missing-file-only fallback |
| Theme | `config/theme.json` contains CSS variables, rules, media queries, and keyframes; per-site overrides merge recursively | Extend the same system to handoff, acknowledgment, and optional analytics controls |
| Example | Root `example.html` is a standalone neutral page with embedded CSS and no runtime config request | Keep it usable offline; add an explicit neutral-only regeneration command using the shared renderer |
| Links | Same-tab navigation, configured labels/icons, optional secondary links, working placeholders | Retain direct `href` values; optionally enhance eligible interactions with native or Bouncy handoff |
| Browser opening | None | Add detection, platform strategies, loop protection, manual assistance, and honest fallback events |
| Age acknowledgment | None | Optional lightweight self-attestation, off by default |
| Analytics | Optional Cloudflare beacon; no custom event collection | Add local event interface and optional GA4 adapter; keep Cloudflare visits/performance support |
| Deployment | Public/automatic builds in `dist/`; strict private builds in `dist-private/`; documented Cloudflare setup | Preserve commands; document independently configured projects in one repo |
| Security | CSP, escaped text, HTTPS URL validation, selected image copying, symlink checks, publication audit | Extend validation and CSP without weakening existing protections |
| Verification | Node tests for builds, configuration, theme, assets, SEO, and publication isolation | Add strategy, state, browser integration, analytics, and real-device acceptance tests |

The earlier specification records baseline verification of **18 tests discovered, 17 passed, one skipped** because that environment blocked Git subprocesses from Node. This historical result is retained, not rerun or newly verified during this specification expansion. It is not a claim that browser handoff works. No mobile handoff or live Cloudflare test was performed during this expansion.

### Preserve these contracts

- Existing site configs without new feature fields continue to build.
- `npm run build` and `npm run dev` automatically use local settings when present.
- An unreadable or malformed real config fails; it never silently becomes the demo.
- `npm run build:example` ignores local and environment private input.
- Ordinary builds never overwrite `example.html` or any source config with production data.
- Generated output and private inputs remain ignored by Git.
- Visible labels and destination order remain exactly configurable.
- Placeholder links remain clickable; unfinished pages remain `noindex, follow`.
- Canonical metadata and sitemap generation still depend on valid deployment settings.

## 3. Architecture and repository layout

Use progressive enhancement: the HTML document is a complete links page before visitor JavaScript runs. The browser-opening module decides how to attempt a navigation; it does not own profile rendering or invent destinations.

The existing `config/site.example.json`, ignored `config/site.json`, and `config/theme.json` remain the configuration foundation. In the inspected baseline, `scripts/build.mjs` renders `src/index.html`; root `example.html` is a separately maintained static snapshot with embedded CSS. The proposed shared renderer and explicit neutral snapshot regeneration remove that maintenance duplication while retaining offline use. No separate demo application, production template, or site-specific source fork is needed. The layout below documents proposed restructuring only; it does not authorize changes in this task.

```text
config/
  site.example.json             committed neutral example
  site.schema.json              planned editor schema for the documented config
  site.json                     ignored local deployment config
  theme.json                    committed shared styling
src/
  index.html                    shared semantic template
  client/
    app.js                      small initialization and event wiring layer
    browser-context.js          conservative environment detection
    browser-opening.js          pure strategy selection and URL construction
    handoff-controller.js       attempt lifecycle, loop guard, fallback state
    analytics.js                event interface and optional GA4 adapter
    age-acknowledgment.js        optional self-attestation
scripts/
  config.mjs                    selection, normalization, and validation
  theme.mjs                     JSON-to-CSS compiler
  render.mjs                    planned reusable pure HTML renderer
  build.mjs                     output orchestration and asset copying
  example.mjs                   planned explicit neutral example regeneration
  serve.mjs                     local preview
  check-public.mjs              publication boundary audit
public/
  _headers                      baseline response policy
  images/                       public demo assets only
docs/
  architecture.md               planned rendering, configuration, and deployment boundaries
  configuration.md
  browser-opening.md            planned native/Bouncy compatibility and limitations
  analytics.md
  cloudflare.md
  security.md
  testing.md                    planned automated/manual verification guide
  images/                       planned neutral browser screenshots
tests/                          unit and build integration tests
.github/workflows/ci.yml         planned public-input-only checks
example.html                    committed standalone neutral snapshot
SPEC.md                         this document
README.md                       product and contributor entry point
LICENSE                         planned MIT license for reusable source
.private/                       ignored assets and operating notes
dist/                           ignored normal/example build output
dist-private/                   ignored strict private build output
```

The file names describe responsibilities, not a requirement to create abstractions without a use. Small modules may be combined if separation remains testable and clear. Do not introduce a strategy framework, plugin registry, state-machine library, or dependency injection container.

### Build pipeline

1. Select and parse config with sanitized errors.
2. Normalize backward-compatible defaults and validate known fields.
3. Compile theme overrides and resolve only referenced assets.
4. Render complete HTML with direct links and an allowlisted set of public runtime options.
5. Write generated files only after validation succeeds.
6. Copy first-party client modules only when required by enabled features; version their references for reliable updates.
7. Generate CSP permissions for enabled integrations and configured image origins.

Do not serve or copy `site.json`, private notes, arbitrary extra fields, or the entire config object. Browser options are public and must contain only fields needed for interactions. Serialize them safely, escaping `<` and other HTML-sensitive characters if embedded in an inert JSON element; do not create executable config strings or inline event handlers.

## 4. Configuration contract

### Selection and build commands

| Command | Inputs | Output |
| --- | --- | --- |
| `npm run build` | `SITE_CONFIG_JSON` if set; otherwise `config/site.json` if present; otherwise sample | `dist/` |
| `npm run build:production` | Same precedence plus production validation | `dist/` |
| `npm run build:example` | Sample only; ignores real inputs even if malformed | `dist/` |
| `npm run build:private` | Environment input or local real config; no sample fallback | `dist-private/` |
| `npm run build:private:production` | Strict private input plus production validation | `dist-private/` |
| `npm run example:refresh` (planned) | Sample, shared template, and theme only | Root `example.html` |

Only `ENOENT` for the local file permits normal-build fallback. An explicitly set empty or invalid environment variable is an error. On Cloudflare, customized builds must satisfy `CF_PAGES_BRANCH === (SITE_PRODUCTION_BRANCH || 'main')`. Strict private Cloudflare builds require the environment input rather than a local-file fallback.

### Existing fields

| Field | Contract |
| --- | --- |
| `name`, `bio`, `description` | Required plain text; escaped on output |
| `siteUrl` | Empty in preview, otherwise HTTPS origin without path/query/fragment |
| `placeholderLinks`, `previewNote` | Explicit unfinished-site behavior and optional visitor copy |
| `profile` | Initials, optional image, descriptive alternative text |
| `primaryLink` | Required primary label, HTTPS URL, and optional icon |
| `secondaryLinks` | Ordered links with explicit `enabled` boolean |
| `seo` | Title and optional sharing image/alternative text |
| `appearance` | Browser theme, color scheme, favicon colors |
| `styles` | Partial recursive overrides to shared theme |
| `analytics.cloudflareToken` | Empty or valid public site beacon identifier; never an account API token |

All enabled destinations must be complete HTTPS URLs without credentials. Preserve the URL's path, query, and fragment. `url` remains the direct destination and required fallback even when a separate Bouncy URL is supplied. Disabled links still need structurally valid feature options; do not let disabling a link hide malformed strategy settings.

### Planned optional fields and defaults

An omitted feature block preserves the previous direct-link behavior. New example config should explicitly demonstrate `native` with automatic opening disabled. Defaults are normalized centrally, never separately in several client modules.

| Field | Values / default | Meaning |
| --- | --- | --- |
| `schemaVersion` | Optional `1` for legacy; `2` for the expanded schema | Reject unsupported explicit versions; document migration |
| `browserOpening.mode` | `direct`, `native`, or `bouncy`; omitted block means `direct` | Global behavior; Bouncy use is opt-in |
| `browserOpening.autoOpen` | Boolean, default `false` | Native mode only: allow a bounded experimental attempt to open this landing page externally |
| `browserOpening.showManual` | Boolean, default `true` in native mode | Offer an unobtrusive Open in Browser control in supported in-app contexts |
| `browserOpening.iosStrategy` | `instagram` or `safari`; default `instagram` | Select one experimental iOS strategy; no automatic cascade |
| `browserOpening.androidPackage` | Default `com.android.chrome` | Validated package name for an external browser; document absence/chooser behavior |
| `browserOpening.fallbackDelayMs` | Integer 800–5000; default `1800` | Time before showing unconfirmed-attempt assistance; never a success threshold |
| `browserOpening.labels` | Optional plain-text labels with built-in defaults | Manual open, retry, continue here, and device instructions |
| Link `id` | Optional unique `[a-z0-9_-]`, 1–40 characters | Stable non-sensitive event identifier; deterministic positional ID if absent |
| Link `openingMode` | `inherit`, `direct`, `native`, `bouncy`; default `inherit` | Per-destination strategy override |
| Link `bouncyUrl` | Optional complete HTTPS URL; absent by default | Operator-created Bouncy handoff link for the same direct destination; used only in Bouncy mode |
| `ageAcknowledgment.enabled` | Boolean, default `false` | Optional 18+ self-attestation |
| `ageAcknowledgment.message` | Plain text with a neutral default | Visible explanation |
| `ageAcknowledgment.remember` | `session` or `none`; default `session` | Store only the acknowledgment state, if storage works |
| `analytics.ga4MeasurementId` | Empty by default; validated `G-…` identifier | Optional event reporting; public identifier, not a secret |
| `analytics.ga4Consent` | `required` or `granted`; default `required` | Hold GA4 until consent, or use operator-selected deployment policy |
| `analytics.debug` | Boolean, default `false` | Local developer event diagnostics without raw destinations |

The schema and executable validator must agree. Reject wrong types, unknown enum values, invalid IDs, duplicate IDs, non-finite/range-invalid timeouts, and package/scheme injection. Extra legacy metadata may remain accepted for compatibility but must never be serialized through a spread of the source config.

Resolve a link's mode from its override, then the global mode. If Bouncy mode is selected without a `bouncyUrl`, use the direct `url`; do not create a provider link or require an upgrade. A supplied malformed or credential-bearing `bouncyUrl` is a configuration error, not a reason to silently change destinations. Native-only settings have no effect in direct or Bouncy mode, allowing operators to switch modes without deleting their native preferences.

Illustrative fragment, to be merged into a complete site config:

```json
{
  "schemaVersion": 2,
  "browserOpening": {
    "mode": "native",
    "autoOpen": false,
    "showManual": true,
    "iosStrategy": "instagram",
    "androidPackage": "com.android.chrome",
    "fallbackDelayMs": 1800
  },
  "primaryLink": {
    "id": "projects",
    "label": "Explore my work",
    "url": "https://example.com/projects?source=profile#latest",
    "icon": "arrow",
    "openingMode": "inherit"
  },
  "ageAcknowledgment": { "enabled": false, "remember": "session" },
  "analytics": {
    "cloudflareToken": "",
    "ga4MeasurementId": "",
    "ga4Consent": "required",
    "debug": false
  }
}
```

Keep all deployment-specific styling in the ignored real config. All UI styling, including newly introduced controls and states, belongs in `theme.json` plus overrides. Preserve reduced-motion, keyboard-focus, forced-colors, and touch-target rules.

### Public source, deployment settings, and secrets

| Class | Examples | Storage and exposure |
| --- | --- | --- |
| Public reusable source | Templates, scripts, schema, neutral config/assets, default theme, docs, deployment instructions | Committed to the single public repository; suitable for public CI and portfolio screenshots |
| Deployment-specific settings | Branding, real direct/Bouncy URLs, theme overrides, domain, feature flags, public analytics identifiers | Ignored local config or project-scoped build settings; only intended display/runtime values enter the generated site |
| Actual secrets | Cloudflare API tokens, GitHub credentials, private keys, service API secrets | Hosting/CI secret storage or protected local deployment environment only; never committed, placed in site config, embedded in output, or included in public logs/artifacts |

Client-visible values are public even when injected through encrypted build variables. Visitors can inspect HTML, scripts, network requests, images, direct destinations, and Bouncy URLs. Cloudflare beacon tokens and GA4 measurement IDs are public identifiers, not account credentials. Keeping production settings out of Git protects source separation; it does not make their rendered values secret. Deployment credentials belong to deployment tooling, never visitor-side code or the renderer's public runtime options.

Document which optional providers receive visitor requests, what telemetry is enabled, and the operator's consent/privacy choices. Disabling first-party analytics does not prevent Cloudflare, an external image host, Bouncy after a click, or a destination site from processing requests. Do not add hidden provider calls, tracking parameters, or prefetches for disabled integrations.

## 5. Browser-opening behavior

### 5.1 Core invariants

- Actual content, destinations, and metadata remain identical for visitors and reviewers. Detection changes navigation assistance only.
- Original anchors always contain the actual configured HTTPS destination. With JavaScript unavailable or broken, normal navigation works.
- Handoff occurs only in a recognized Instagram mobile context and only when enabled for the relevant operation. Normal browsers, desktops, unknown in-app browsers, and uncertain classifications use normal links.
- User-agent detection is a heuristic, not security, authentication, or proof of an app version. Do not use bot lists, referrer allowlists, or fingerprinting as substitutes.
- Do not intercept modified clicks, middle-click, download behavior, context menus, or open-in-new-tab gestures.
- If strategy construction or initialization fails, leave the link's default navigation intact.
- No network request, analytics callback, artificial delay, or asynchronous permission flow may consume the user activation before a tap-triggered launch.

### 5.2 Strategy interface and platform mechanisms

Use pure functions for environment classification and strategy planning. A plan reports the selected mechanism, exact target URL, whether activation is needed, any launch URI, and the direct fallback. DOM effects and lifecycle timers belong in the controller.

| Strategy | Planned mechanism | Reliability boundary |
| --- | --- | --- |
| Direct | Ordinary HTTPS anchor | Baseline on all browsers; it can remain inside the host app |
| Native iOS, Instagram | `instagram://extbrowser/?url=` plus one encoding of the complete target URL | Undocumented Meta behavior; may be blocked, ignored, changed, or require confirmation |
| Native iOS, Safari alternative | `x-safari-https://` plus the HTTPS target remainder | Undocumented Safari scheme; selects Safari rather than necessarily the user's default browser; opt-in only |
| Native Android | Validated `intent://…#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=…;S.browser_fallback_url=…;end` | Browser/WebView decides whether to honor it; package may be absent; user activation generally required |

Firsthand implementation reports disagree about whether iOS automatic navigation or a tap is required. Treat both as experimental, not an official Meta contract. The July 2026 [InAppBrowserEscaper maintainer report](https://jhrun.com/2026/07/inappbrowserescaper-v1-0-1-improved-instagram-ios-escape/) describes tap-triggered `extbrowser`; a separate implementer's [September/October device observations](https://plugwith.me/blog/what-escapes-instagram-in-app-browser-in-2026/) describe a meta-refresh path. Neither establishes compatibility for this project.

Android intent syntax, fallback extras, and user-activation restrictions are documented by [Chrome](https://developer.chrome.com/docs/android/intents). Chrome's documentation does not guarantee Instagram's WebView implements identical behavior.

### 5.3 Automatic versus user-initiated handoff

**Automatic entry handoff:** in native mode when `autoOpen` is true, attempt to open the **same landing page** externally, never jump straight to its primary destination. Render the page first. Restrict this experiment to supported iOS strategy/context combinations; a dynamically created one-shot meta refresh may be used for the Instagram strategy, with a bounded removal/cleanup path. No unconditional refresh tag is allowed in generated HTML.

Automatic attempts require a visible top-level document, valid HTTPS page URL, no prior-attempt guard, and any configured age acknowledgment. Do not attempt during prerendering, hidden state, restored back/forward state, or inside an iframe. Android page-load attempts must defer to a tap because they do not satisfy the documented activation requirement. Record that deferral without claiming failure or success.

**Manual page handoff:** an Open in Browser control attempts the current landing page URL. Show concise platform instructions if the scheme is ignored. The user may dismiss the assistance and continue browsing the landing page.

**CTA handoff:** a normal unmodified tap on a native-enabled link may attempt that exact destination in an external browser. Keep an explicit direct Continue here link available in the fallback panel. A direct per-link override must bypass native handling entirely.

Do not catch every tap on the page, create hidden clickable overlays, synthesize user activation, or repeatedly try alternative schemes. One deliberate action produces at most one scheme launch.

### 5.4 URL integrity and loop prevention

- Preserve destination query parameters, repeated keys, encoded characters, and fragments. Do not append campaign data or the landing page's query to outgoing links implicitly.
- Encode nested URLs exactly once at the wrapper boundary. Never concatenate untrusted input into intent extras, package fields, executable strings, or refresh markup.
- Android intent targets containing fragments or reserved syntax need explicit round-trip verification against Android URI parsing. If exact preservation cannot be established, choose direct navigation/manual instructions for those URLs rather than dropping the fragment or changing the path.
- No user-controlled `url`, `next`, or `redirect` query parameter can select an arbitrary automatic target. Only the current page or a configured anchor is eligible.
- For same-site handoffs, use a reserved `_lp_handoff=1` marker solely to suppress another automatic attempt. Preserve all existing query parameters and the original fragment when adding the marker. It must not grant access, alter displayed content, or acknowledge age.
- Use a session guard when available, plus an in-memory attempted flag. Write the guard before launching. A marked URL must suppress automatic opening even when storage is blocked or cleared.
- If the marker cannot be safely written/retained in the current address and no reliable persisted guard is available, disable automatic opening and keep manual assistance.
- Do not add the marker to third-party destinations. Explicit user retries may run again, but automatic retries may not.
- A return from another app, reload, timer wake-up, or `pageshow` event must not trigger another launch automatically. Clean up timers and temporary refresh nodes on page hide, navigation, dismissal, and completion.

### 5.5 Attempt state and fallback UX

Use a small explicit state model:

```text
idle -> attempted -> page_hidden_observed
                  -> unconfirmed -> fallback_visible
                  -> launch_error -> fallback_visible
fallback_visible -> direct_navigation | explicit_retry | dismissed
```

`page_hidden_observed` means only that the document became hidden or received `pagehide`. It does not prove a browser opened, the destination loaded, or a purchase occurred. Returning to the page can show assistance without repeating the handoff. Suppress stale fallback timers while hidden.

After an unconfirmed attempt, show inline assistance near the affected controls: Retry opening, Continue here, and a short instruction to use the app's browser menu. The direct fallback must be a real anchor to the same destination. Do not automatically send the visitor to a store, download page, different service, or fallback destination after a timer.

Use polite live-region status text, keyboard-operable controls, and a dismiss action. Keep the profile and links visible; avoid full-screen conversion blockers and repeated prompts. Do not claim “opened successfully” based on timeouts, focus changes, visibility, or an API call returning without throwing.

### 5.6 Optional Bouncy.ai handoff

Bouncy is a URL-based external-browser handoff provider, selected through the same configuration and rendering path as direct/native behavior. The operator creates any provider link outside this application and supplies `bouncyUrl` alongside the required direct `url`. Do not implement account management, a provider API, a bundled SDK, or a backend proxy. An ordinary service URL in a legacy `url` remains an ordinary link; do not reinterpret it as a configured Bouncy integration by hostname alone.

- A normal unmodified tap on a Bouncy-enabled CTA in a recognized Instagram mobile context may navigate to the configured Bouncy HTTPS URL. Make provider use clear and keep a visible direct Continue here link available before departure; its target is always the original direct URL.
- Keep the main anchor's direct `href`. JavaScript unavailable, unsupported/uncertain context, absent provider URL, disabled integration, or initialization failure means ordinary direct navigation. Normal browsers and modified clicks retain ordinary link behavior.
- Bouncy applies to configured outbound CTAs. It does not replace the landing page, change the public bio URL, or participate in automatic page-entry handoff. Do not chain native schemes and Bouncy attempts for one action.
- If a launch fails locally, retain direct navigation and manual browser-menu instructions. After navigation leaves this site, it cannot reliably detect a provider outage, expired link, quota limit, or the final destination's load. Returning visitors must be able to choose the direct link; do not promise automatic recovery from a remote failure or infer success from a timeout.
- Preserve supplied URLs without inventing provider query parameters or transmitting the landing page's query. The operator must verify the provider link reaches the same intended destination, including necessary query/fragment values. The static build cannot prove that mapping or prevent a provider-side destination from changing later.
- No paid Bouncy plan is required. Missing access to a free provider link must leave the full direct/native experience available, with no paywall or setup blocker in this application. Public samples and automated tests use synthetic values and need no live provider account.

As checked on 2026-10-26, Bouncy's [own setup guide](https://blog.bouncy.ai/blog/create-bouncy-link-instagram-bio/) describes a free account with one link on `bouncy.ai` and a Conservative mode; extra domain choices, behavior modes, and analytics are paid features. These are vendor terms that may change, not platform dependencies or tested compatibility claims. Do not require one Bouncy link per CTA or deployment when the free allowance cannot cover them.

Document the trade-offs: leaving Instagram may improve access to saved logins or payment features, but an extra redirect, provider branding, prompts, added taps, changed cookie storage, or a provider outage can increase friction and reduce conversions. Device, OS, Instagram version, and provider behavior determine compatibility; no universal browser escape or conversion uplift is promised. Shortened links and redirect chains may also face platform-policy restrictions or reputation filtering. Neither Bouncy nor native handoff may conceal the destination/content from reviewers, evade moderation, or be presented as a guarantee against blocking. Document provider request/analytics exposure even when this site's own analytics is disabled.

## 6. Landing-page experience and optional acknowledgment

Preserve the existing centered profile, portrait/initials, short biography, prominent primary CTA, secondary links, and footer. Extend it with unobtrusive browser assistance and optional acknowledgment. Public samples use generic branding and `example.com` destinations.

Accessibility targets: semantic headings/navigation, visible keyboard focus, usable 200% zoom, no horizontal overflow at 320 CSS pixels, minimum 44-by-44 CSS-pixel controls, WCAG AA text contrast in defaults, reduced motion, descriptive image alternatives, and status announcements that do not unexpectedly move focus. Test the chosen custom theme as well as defaults.

Age acknowledgment is an optional **self-attestation**, not identity verification, access control, or a guarantee of regulatory compliance. Use a small visible 18+ notice and deliberate acknowledgment; do not collect birth dates or identity documents. The same content and notice are delivered to all visitors.

When enabled and JavaScript works, defer enhanced outbound actions until acknowledgment; after the acknowledgment tap, continue the user's intended action at most once. Remember only a boolean in session storage when configured. Handle unavailable storage. A new external browser has separate storage and may ask again. Do not encode acknowledgment in a URL. With JavaScript disabled, show the notice and preserve ordinary links; document that this is not a mandatory age-verification system.

### Example policy

- Standard builds leave root `example.html` untouched.
- A planned `example:refresh` command renders only the neutral sample with the shared template/theme, embedding the CSS for direct disk opening.
- The standalone snapshot demonstrates layout and functional ordinary links without runtime config, analytics, or an asset-loading requirement. It is not the mobile-handoff test surface.
- `npm run build:example` produces the full served demonstration using the same renderer and client modules as production. Use that build for browser interactions, screenshots, and device tests.
- Neither path may read real configuration or include private runtime values. Test this with poisoned environment/local inputs.

## 7. Analytics and reliability

All core links and handoff decisions must work without analytics. Collection is optional; the default sample has no external analytics identifier. No event may block navigation or throw into the interaction path.

Expose a documented `profile:analytics` CustomEvent containing a small allowlisted payload. It is an integration/debugging interface, not durable storage or a dashboard. With no collector, events remain local and are not reported as collected remotely.

| Event | Meaning |
| --- | --- |
| `landing_view` | Client initialization on a visible landing page |
| `outbound_click` | Visitor activates a configured CTA |
| `browser_strategy` | Effective direct/native/Bouncy mechanism selected for an action |
| `handoff_attempt` | A native scheme launch or Bouncy HTTPS navigation was attempted, with automatic/manual/CTA trigger |
| `handoff_deferred` | Automatic attempt was not permitted; a gesture is needed |
| `handoff_page_hidden` | Page visibility/navigation observation, not confirmed success |
| `handoff_unconfirmed` | Wait interval elapsed without a reliable observable departure |
| `handoff_returned` | Visitor returned to a page after an attempt |
| `fallback_shown`, `fallback_click` | Assistance displayed or direct fallback activated |
| `age_acknowledged` | Optional self-attestation control activated |

Permitted fields include stable link ID, platform category, selected strategy, trigger, and a bounded reason code. Do not send raw destination URLs, query strings, fragments, user-agent strings, identifiers from incoming URLs, or free-text configuration. Do not create a `handoff_success` event without independently verifiable evidence; no such evidence exists in the planned static implementation.

Cloudflare Web Analytics remains the optional visit/performance integration. Its current FAQ says custom events and UTM-query reporting are unsupported; do not invent a Cloudflare custom-event endpoint. See the [Cloudflare FAQ](https://developers.cloudflare.com/web-analytics/faq/).

GA4 is an optional adapter for the event interface. Use documented [gtag events](https://developers.google.com/analytics/devguides/collection/ga4/events) and deliberate [page-view configuration](https://developers.google.com/analytics/devguides/collection/ga4/views). Avoid duplicate page views/outbound events from automatic measurement. Override page location/referrer to exclude query and fragment data; document corresponding dashboard enhanced-measurement settings. Keep Google Ads features off.

When `ga4Consent` is `required`, do not load Google code or send/queue pre-consent traffic for later replay. Provide small inline allow/decline controls and a way to change the preference. If the operator selects `granted`, document that it is an operator policy choice, not a finding about legal requirements. Keep ads consent denied and do not enable advertising features. Use [Google's consent guidance](https://developers.google.com/tag-platform/security/guides/consent) when implementing the adapter.

Cap any queue and isolate adapter exceptions. GA4, blockers, offline networks, and rapid app switching can lose events. Handoff metrics are directional diagnostics; they do not establish delivery, conversion, or causation. Do not use visitor analytics to reveal private config in public CI logs.

## 8. One public repository, multiple environments

| Environment | Source and build | Config | Publication boundary |
| --- | --- | --- | --- |
| Local demo | `build:example` / root standalone example | Committed neutral sample | Suitable for public screenshots |
| Local configured site | Normal `build` / `dev` | Ignored local `site.json` | Generated files stay ignored |
| Public hosted demo | Separate Pages project, `build:example`, output `dist` | No private variables | Public portfolio and normal preview builds |
| Production sites A, B, … | Same repo and renderer, one Pages project per site, strict production build | Each project's own production-scoped `SITE_CONFIG_JSON` | Public rendered sites; inputs remain outside GitHub and isolated from each other |
| Optional staging | Separate Pages project | Synthetic sample or its own isolated input | Explicit hostname, analytics ID, and preview policy |

Use one public repository by default. A second private repository may be considered only for a concrete technical or security need that cannot be met by isolated deployment settings and the existing build/upload workflow; record that justification before changing the architecture. Private production configuration alone is not such a justification.

Each Pages project has its own branding, link set/order, theme, enabled features, domain, analytics settings, build variables, and release/rollback history. Changing these settings requires configuration and a rebuild, never edits to application source or a per-site code branch. Build only the selected site's assets and public options; no generated site may contain another site's configuration. Multiple domains on one Pages project are aliases for that output, not independently configured websites. A staging branch can set `SITE_PRODUCTION_BRANCH` explicitly for that project. Never make sensitive build variables available to untrusted pull-request code.

The existing environment/local/sample selection is sufficient for independent builds. Local operators can supply a different `SITE_CONFIG_JSON` for each invocation; ensure each generated output is deployed to its intended project before reusing the output directory. Named local profiles, a tenant database, a hostname-driven runtime config registry, and separate application packages are not required. Shared code updates may build several connected projects, but one site's config change or rollback must not change another site's settings.

Cloudflare documents multiple Pages projects connected to one repository, currently with a default maximum of five such projects and an increase-request path. Budget for shared build quotas as the demo, staging, and production sites grow. If the connection limit becomes relevant, evaluate a limit increase or separate output uploads from the same source before adding repositories. See [multiple-project support and limits](https://developers.cloudflare.com/pages/configuration/monorepos/).

Real local settings belong at **`config/site.json`**, beside the example. Git ignores that file, `.private/`, generated folders, environment files, credentials, screenshots of production, and build archives. Use a neutral CI fixture or sample; do not upload production artifacts to public Actions runs.

The existing keyword audit currently treats some generic platform terminology as private. Implementation must distinguish permitted compatibility documentation from actual deployment identities and exact private values. Update local exclusion terms deliberately; do not disable the audit, broadly whitelist production URLs, or weaken marker tests to make documentation pass. This specification contains technical platform names but no creator-specific data.

The source audit must cover newly added client files, schemas, documentation images, license, and workflow files. Binary screenshots need appropriate handling; a text substring scan is not an image privacy review. Use neutral screenshot provenance plus explicit visual inspection. Check tracked paths and history separately from `.gitignore`.

A public GitHub deployment check may expose a production deployment URL. Config isolation is not a guarantee that the repo and live site cannot be associated. Document the option to build locally and upload output if avoiding public deployment links is important; that does not require a second repository.

## 9. Cloudflare Pages and security

### Deployment contract

- Framework: None; Node.js 22 or newer; build/output pairing from section 4.
- Connect the same GitHub repository to separate demo and production Pages projects.
- Supply the complete real JSON through the production-scoped build variable `SITE_CONFIG_JSON`; use the dashboard's encrypted value option where available. Verify it reaches the build environment, not only runtime Functions. Never print it.
- Disable production-project preview deployments or ensure previews receive only neutral inputs and cannot read production variables.
- Add the domain through Pages Custom domains, then follow its DNS association process; activate HTTPS and verify the final hostname before enabling live metadata.
- Keep the custom hostname proxied for zone-level WAF controls. The separate `pages.dev` hostname does not inherit the custom zone's WAF rules.
- Deploy only generated output. Ignored local images are unavailable to Git-backed builds; use publicly readable HTTPS images, initials, or a local build plus upload.
- Keep rollback instructions and verify headers, 404 status, links, and analytics after deployment. Rebuild to apply config changes.

The deployment/custom-domain guide must distinguish apex domains, which require a Cloudflare zone in the same account as the Pages project, from subdomains, which can use a CNAME at another DNS provider. Zone-level WAF controls still require the hostname to use the operator's Cloudflare proxy. Cover nameserver changes without losing existing DNS/mail records, certificate activation/CAA troubleshooting, final `siteUrl`, and the separate public `pages.dev` endpoint. See [Cloudflare's domain requirements](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Primary references: [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/), [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/), and [encrypted-variable settings](https://developers.cloudflare.com/pages/functions/bindings/#secrets). Dashboard labels and entitlements must be checked when the operational guide is updated.

### Cloudflare Free capabilities and limits

The baseline must fit Pages Free and a Free Cloudflare zone, without paid WAF rules or a Functions backend. Availability below was checked on 2026-10-26; deployment guides must link current primary documentation and recheck limits when updated.

| Capability | Free-tier boundary and project use |
| --- | --- |
| Static Pages hosting, custom domains, HTTPS | Suitable for the baseline; domain registration/renewal is separate. Current Free limits include 500 builds/month, one concurrent build per account, and 100 custom domains per project. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [domain/certificate setup](https://developers.cloudflare.com/pages/configuration/custom-domains/). |
| DDoS protection | Standard automatic, unmetered protection is included on Free; advanced capabilities vary by plan. See [DDoS availability](https://developers.cloudflare.com/ddos-protection/#availability). |
| Managed WAF rules | The Cloudflare Free Managed Ruleset is enabled by default on Free and is a subset of the broader ruleset. Do not promise the full paid Cloudflare/OWASP rulesets. See [WAF setup](https://developers.cloudflare.com/waf/get-started/). |
| Custom WAF rules and Managed Challenge | Free permits five custom rules per zone and supports Managed Challenge; regex and the Log action are unavailable. See [custom-rule availability](https://developers.cloudflare.com/waf/custom-rules/#availability). |
| Browser Integrity Check | Available as a zone control for suspicious request headers; it is not proof of identity or humanity. Review false positives. See [Browser Integrity Check](https://developers.cloudflare.com/waf/tools/browser-integrity-check/). |
| Bot Fight Mode | Available on Free, with broad domain-wide behavior. Keep optional and test conversion/compatibility effects; paid bot controls are not baseline requirements. See [Free bot features](https://developers.cloudflare.com/bots/plans/free/). |

Pages hosting limits and zone-security entitlements are separate. A Free Pages deployment does not itself configure WAF rules on its custom domain, and those rules do not extend to Bouncy, outbound destinations, or the project's `pages.dev` hostname.

### Security requirements

Keep Cloudflare WAF, Managed Challenges, Browser Integrity Check, and bot settings in the hosting/zone configuration and operational documentation. They must be configurable without changing application logic, and the application must not embed Cloudflare management credentials or treat a client-side flag as proof of verification. Neutral rule examples or future deployment automation may live in the public repo; actual zone settings and credentials remain deployment-specific. Application headers and safe rendering remain separate responsibilities.

- Retain CSP, MIME-sniffing prevention, framing restrictions, referrer policy, and unused-browser-feature restrictions.
- Keep executable first-party code external. Add only integration-specific CSP sources; do not solve module or analytics errors with `unsafe-inline`, `unsafe-eval`, or unrestricted origins. Validate against [Google's CSP guidance](https://developers.google.com/tag-platform/security/guides/csp) for an enabled GA4 adapter.
- Preserve escaped text, HTTPS-only configured destinations, safe JSON serialization, CSS injection checks, restricted image paths, and symlink containment.
- Allow custom launch schemes only inside the trusted strategy builder after validating the original HTTPS target. Do not allow raw scheme strings in configuration.
- Reject arbitrary automatic redirect targets from the address bar. The marker for loop suppression has no security authority.
- Never log private JSON, parser excerpts, complete analytics payload URLs, or environment contents.
- Preserve the same underlying landing content for crawlers, reviewers, and people. Optional browser assistance is a capability enhancement, not a content-access rule.

Document targeted Managed Challenge rules and optional temporary stronger browser verification. Prefer evidence-based abuse rules over challenges on every visit. Blanket verification and Bot Fight Mode stay off in the recommended normal-traffic baseline; operators may enable them for observed abuse and must have a rollback path.

The dashboard guide must include an optional hostname-scoped site-wide Managed Challenge with a clear rollback procedure. Explain that blanket challenges can prevent the landing page and handoff script from loading, interrupt review systems, and require a second clearance after switching browser cookie stores. Added waits, prompts, false positives, and abandoned visits may reduce conversions; compare actual behavior before retaining stronger verification. Embedded browsers have [limited challenge support](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/). Browser-opening code does not bypass WAF or bot verification. Never select challenge rules to hide content from platform reviewers or serve them a different page.

### Threat and failure model

| Risk | Required response |
| --- | --- |
| Private input committed or copied to output | Ignore rules, allowlisted serialization/assets, public-source and history checks |
| Config XSS or intent injection | Context-aware escaping, typed schema, validated targets/packages, tested encoding |
| Arbitrary redirect abuse | No address-bar destination routing; configured anchors and current page only |
| Repeated scheme prompts or navigation loops | One automatic attempt, durable marker/guard, explicit retries only |
| Unavailable third-party script | Independent static links and isolated optional modules |
| Misleading analytics | Attempt/observation terminology; no inferred success |
| Abusive traffic | Cloudflare zone controls and measured operational rules |
| Scheme behavior changes | Small replaceable strategies, configuration kill switch, tested direct fallback |
| Bouncy failure, changed mapping, or plan limits | Required direct URL, visible direct alternative, operator verification, configuration disable switch; no claim of remote failure detection |

## 10. Compatibility expectations

This is a **planned behavior matrix**, not a list of device-verified claims. Implementation documentation must add observed device/OS/app versions, test dates, and result evidence.

| Context | Native behavior | Automatic entry | Fallback |
| --- | --- | --- | --- |
| Instagram on iPhone/iOS | Experimental Instagram scheme; optional Safari alternative | Opt-in, best effort, may prompt or do nothing | Real direct link and app-menu instructions |
| Instagram on Android | Intent to configured external browser | Defer to a user gesture | Intent HTTPS fallback where honored, plus visible direct link |
| Instagram on iPad/iPadOS | Recognize only when app/OS signals are sufficiently clear | Same experimental restrictions as iOS if recognized | Direct behavior for uncertain desktop-style UA |
| Safari on iOS/macOS | Ordinary links | None | Ordinary links |
| Chrome/Firefox/other regular mobile browser | Ordinary links | None | Ordinary links |
| Desktop browsers | Ordinary links | None | Ordinary links |
| Other or unrecognized in-app browser | Ordinary links | None | No claim of native support |
| JS disabled, failed, or blocked | Static page and direct anchors | None | Visible notice where relevant |
| Storage unavailable | Manual attempts; auto only with reliable URL guard | At most one guarded attempt | Direct links; no repeated prompts |
| Custom scheme blocked / browser absent | Unconfirmed or error state | No repeated attempt | User-controlled direct navigation |

Web pages cannot guarantee which browser becomes active or observe its successful load. App versions, OS updates, default-browser settings, device policy, installed apps, and browser permission prompts can change results independently of this site's release.

Bouncy requires its own observed Instagram iOS/Android results; native-strategy evidence does not validate the provider. Until those checks exist, label Bouncy compatibility unverified. The integration uses direct links in other/uncertain contexts and has no automatic-entry behavior. Include provider unavailability, cancellation, back navigation, and direct fallback in its device checks.

## 11. Testing and acceptance

### Automated tests

Use the existing Node test runner for pure logic and build integration. Add a small development-only browser test suite for DOM/lifecycle behavior; a pinned Playwright setup is acceptable but must not become a production build dependency. Test fakes should model relevant browser lifecycle behavior rather than merely mirror helper implementation.

| Area | Required cases |
| --- | --- |
| Config | All precedence branches; legacy defaults; invalid enums/types; duplicate IDs; invalid timeout/package; empty env; production branch restrictions |
| URL construction | HTTPS/no credentials; Unicode; query ordering/repetition; percent encoding; fragments; `#Intent`/semicolon injection; invalid protocols; exact nested fallback target |
| Detection | Representative iOS/Android Instagram UA; ordinary Safari/Chrome/desktop; iPad desktop UA uncertainty; unknown/missing UA |
| Strategy | Global and per-link direct/native/Bouncy modes; disabled links; Bouncy URL absent/invalid; legacy service URLs unchanged; direct fallback for unsupported exact URL representation |
| Controller | One attempt; pre-launch guard; no timers firing a second navigation; hidden/visible transitions; return/BFCache; blocked storage; marker preservation; cancellation |
| Navigation | Direct href with JS off; missing client script; modified/middle click; fallback to exact original target; exception before interception |
| Acknowledgment | Disabled/default; intended action after acknowledgment once; blocked storage; new browser session; no-JS notice |
| Analytics | Stable IDs; no raw URLs/UA; adapter failure; no duplicate view; capped queue; consent decline; no success inference |
| Rendering | Escaping; safe runtime JSON; CSP matches enabled features; local/remote images; selective copying; SEO and real 404 |
| Demo/privacy | Neutral-only explicit example refresh; private inputs ignored; source template unchanged; no private fields in output unless intended for display |
| Multiple sites | Same source builds distinct synthetic branding/domains/links/features; no cross-site values or assets; deployment config changes do not rewrite source or the neutral snapshot |
| Bouncy | No provider requests when disabled; direct href with JS off; visible direct alternative before departure; no native/provider cascade or automatic remote-success claim; no paid account in tests |
| Accessibility | Keyboard order/focus; live status; reduced motion; contrast; 320px layout; no blocking overlays |

CI must run on public/synthetic inputs without production secrets, test at the minimum supported Node version, build the neutral demo, check reproducibility and source boundaries, and keep artifacts neutral. Required checks must fail rather than silently skip on a capable CI host. Local capability-related skips must be explicit.

### Manual real-device checklist

Record device model, OS, app/browser version, date, configuration, and expected/observed result for each release affecting handoff:

1. Open the custom-domain page from a real Instagram profile/story on iPhone and Android. Confirm the landing content appears before any optional attempt.
2. Test direct mode, native CTA tap, manual page opening, and opt-in automatic behavior separately. If Bouncy is configured, test its CTA handoff and direct alternative independently, including provider failure/expired-link behavior where reproducible.
3. Accept and cancel system/app prompts; test browser absent/disabled, alternate default browser, repeated taps, and slow return to the page.
4. Verify complete query/fragment values at the destination, including encoded and repeated parameters. Use synthetic values only.
5. Return with back navigation, reload, restore the page, open another tab, and block storage. Confirm no loop or spontaneous retry.
6. Disable JS and block analytics/client files independently. Confirm actual links remain available.
7. Test keyboard navigation, screen-reader status, large text/zoom, reduced motion, and small displays.
8. Enable the optional acknowledgment and verify single-action continuation and separate browser storage behavior.
9. Inspect analytics events without treating visibility changes as success. Test declined consent and blocked providers.
10. Repeat with Cloudflare challenges off and a temporary test rule on. Verify custom-domain and `pages.dev` differences, then remove the temporary rule.
11. Capture neutral mobile/desktop screenshots from a real browser for the README; do not use production identity in public assets.

### Performance targets

For the neutral build without optional vendor scripts or a portrait: combined first-party HTML/CSS/JS should remain below **50 KB compressed**. Use system fonts, reserve image dimensions, avoid layout shifts, and keep all interaction work small. Target CLS at most 0.1 and mobile LCP at most 2.5 seconds under a documented reproducible test profile; report measured values and test conditions rather than asserting a guarantee. Recommend optimized portraits below 150 KB.

### Release acceptance criteria

- **AC-01:** A fresh clone builds a neutral page without secrets; an ignored local config automatically customizes normal builds.
- **AC-02:** Existing direct-link configs and visual customization keep working unchanged.
- **AC-03:** Native mode provides bounded iOS/Android strategies and graceful assistance, with no dedicated external service dependency.
- **AC-04:** Normal browsers are unaffected, and core links work without JS, analytics, or successful handoff.
- **AC-05:** URLs survive exactly or the native strategy declines safely; no arbitrary URL routing or silent query loss.
- **AC-06:** Automatic entry behavior never bypasses the links page or loops; unsupported contexts defer to manual interaction.
- **AC-07:** Age acknowledgment is optional, accessible, documented as self-attestation, and cannot corrupt the intended navigation.
- **AC-08:** Analytics distinguishes attempts, observations, and fallback; all collectors are optional and isolated.
- **AC-09:** One public repo supports independent demo/production environments without committing sensitive inputs or artifacts.
- **AC-10:** Cloudflare setup, free security controls, stronger-challenge trade-offs, and rollback are documented and verifiable.
- **AC-11:** Shared rendering, a reproducible neutral example, screenshots, compatibility evidence, and tests make the project understandable to a reviewer.
- **AC-12:** Unsupported or untested device combinations are labeled honestly; no claim of guaranteed native opening or moderation avoidance.
- **AC-13:** Bouncy is optional, configurable per deployment/link, and usable without a required paid plan; every integrated provider URL has a direct destination and honest fallback limitations. Removing Bouncy leaves the primary website fully functional.
- **AC-14:** At least two differently configured sites can be built from unchanged application source with isolated branding, links, domains, themes, analytics settings, and feature flags. The neutral hosted demo shares that rendering implementation.
- **AC-15:** README links a publicly accessible demo and neutral screenshots; architecture, configuration, Cloudflare deployment/custom domains, security/privacy, and integration limitations are documented without exposing credentials or production inputs.

A release can document unavailable device access, but must not describe handoff as production-verified until relevant real-device checks exist. Static/unit tests alone cannot establish app-to-app navigation compatibility.

## 12. Documentation and portfolio deliverables

Update README with the problem, production and portfolio use cases, implemented features, neutral mobile/desktop screenshots, a working public live-demo link, short architecture diagram, quick start, complete neutral configuration example, and links to detailed guides. The hosted demo must be publicly accessible without login and use the same application as production. Clearly separate implemented features from experiments. Keep setup short enough that a reviewer can reproduce the demo locally without account credentials.

Required documentation coverage (extend the existing guides; avoid duplicate specifications):

| Documentation | Required coverage |
| --- | --- |
| Architecture | Static rendering and progressive enhancement; `example.html` snapshot versus served demo; shared renderer; independent deployments and application/Cloudflare boundaries |
| Configuration | Schema, defaults, precedence, migration/backward compatibility, themes/branding, ordered links, feature flags, direct/Bouncy URLs, analytics, public examples, and private production settings |
| Cloudflare deployment and custom domains | Demo plus multiple production projects from one repo; build/output settings; project-scoped variables; preview isolation; DNS/apex/subdomain/HTTPS setup; Free limits; upload alternative and rollback |
| Security and privacy | Public source versus rendered settings versus secrets; safe rendering/CSP; WAF and optional browser verification; conversion effects; public deployment checks; provider requests and analytics/consent choices; no cloaking |
| Integrations and verification | Native and Bouncy compatibility/fallbacks; free-versus-paid provider limits; analytics and acknowledgment limitations; device evidence, accessibility, responsive behavior, and measured performance |

Provide an MIT license for reusable source, a concise contribution guide, documented commands, versioned schema behavior, and CI status. Add a small architecture decision section explaining static generation, progressive enhancement, source/config separation, experimental schemes, optional provider handoff, and event semantics. A separate ADR system is optional; avoid paperwork that duplicates this specification.

Store evidence with neutral data: test output summaries, reproducible screenshot steps, measured performance conditions, and a device compatibility table. Do not invent test coverage percentages, conversion uplifts, device results, or production usage claims. Screenshots must be browser renders of the implementation, not generated design mockups labeled as working software.

Public contributor documentation should explain where ignored `site.json` belongs, what browsers can inspect, how to add a strategy without changing the UI, and how to validate a change without access to any production config.

## 13. Specification review and unresolved decisions

### Conflicts and resolutions

| Existing requirement or documentation | Resolution in this expansion |
| --- | --- |
| Explicit exclusion of Bouncy and restriction to direct/native modes | Superseded by the current request for optional Bouncy integration. Retain native support, direct defaults, and backward compatibility; add an independent direct fallback for provider use. |
| Absolute prohibition on a second private repository | Keep one public repository as the architecture; allow an exception only for a documented technical/security need. No such need is established here. |
| Earlier guides suggest a private repo to hide deployment association | Prefer isolated build settings or local build/upload from the same source. Document that public deployment checks may expose the association; update those guides during later documentation work. |
| Independently maintained `example.html` versus a single rendering implementation | Preserve the current offline file and its neutral-only contract; propose explicit regeneration from shared rendering without implementing it now. |
| Private build input terminology could imply secret client-visible settings | Distinguish source privacy, public generated values, and actual credentials. Encryption at build time cannot hide values delivered to visitors. |
| Native handoff as the central feature versus a fully usable core website | Preserve the native capability, but make its activation and all provider/analytics/acknowledgment features optional. Production links never depend on successful handoff. |
| Detailed implementation sequence versus this specification-only request | Replace the sequence with requirements, acceptance criteria, and decisions. All application restructuring and implementation remain future work. |

Existing configuration precedence, commands/output directories, production branch restrictions, direct-link/SEO behavior, accessibility/performance targets, analytics/acknowledgment requirements, security validation, and publication safeguards remain in force. Only conflicting exclusions are superseded. README and existing guides still describe the baseline until separately updated; this file remains the single authoritative specification.

### Decisions still to resolve

| Decision | Current default and resolution needed |
| --- | --- |
| Production deployment workflow per site | Prefer a separate Pages project using the same public repository and isolated build settings. Choose local/CI output upload where public deployment associations are unacceptable; no private repo is presumed. |
| Bouncy hostname support | A provider-issued HTTPS URL is sufficient for the base design. Before implementation, decide whether to restrict integration URLs to `bouncy.ai` or support explicitly approved provider/custom domains; all choices must retain HTTPS/no-credentials validation and direct fallback without requiring a paid plan. |
| Local management of many production configs | Existing `SITE_CONFIG_JSON` and ignored `config/site.json` cover the required behavior. Defer any named-profile selector or extra file layout until operator needs justify it; preserve current precedence if added. |
| Device support and experimental native defaults | Keep legacy configs direct, the new native example explicitly opted in, and automatic opening off. Real-device evidence must determine which strategies can be described as supported and whether experimental defaults should change. |

The live demo hostname and each production site's branding, analytics/consent policy, and challenge thresholds are deployment choices, not reasons to fork the application. Select them when configuring deployments; do not invent live URLs or compatibility evidence in this brief. No unresolved choice blocks completing this specification-only expansion.

## 14. Known limits and trade-offs

- Undocumented iOS schemes can stop working without notice. Native mode needs a readily available direct-mode kill switch.
- Android activation rules limit automatic opening. A tap is a valid fallback, not proof of a defective deployment.
- Targeting a package improves determinism but may select a browser other than the visitor's default or fail when that browser is absent.
- Handoff changes browser storage context; age state, analytics sessions, cookies, and challenge clearance may not transfer.
- Page visibility is only an observation. Static pages cannot reliably confirm an external destination loaded.
- External service URLs entered as normal links retain ordinary behavior. Optional Bouncy handoff adds provider availability, changing free-tier terms, mutable redirect destinations, privacy exposure, and platform-policy risk; direct navigation remains the fallback, and this application cannot verify a remote handoff succeeded.
- Self-attestation is not a restricted-content boundary. A static public page cannot hide its markup or enforce identity checks.
- Analytics is lossy, and Cloudflare's free Web Analytics does not supply the requested custom-event reporting by itself.
- Keeping real config out of GitHub does not conceal the rendered website or guarantee that its relationship to the repository is undiscoverable.
- Cloudflare challenges can add more friction than handoff removes; security configuration must be evaluated on actual traffic and devices.
- Theme freedom means arbitrary custom themes are not automatically accessible. Defaults and published examples must meet the stated targets.
- This specification expansion did not perform application tests, device handoff checks, or live deployment verification. Record verification limits without presenting planned functionality as completed.
