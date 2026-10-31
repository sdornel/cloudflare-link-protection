# Implementation and verification status

Updated 2026-10-31. The current release scope supports direct/native navigation. Dedicated Bouncy integration is deferred in `SPEC.md`.

## Hosted example browser handoff — 2026-10-31

The public sample now explicitly enables native automatic iOS same-page handoff with manual browser offers hidden. Its three More soon links inherit the configured opening mode and use the shared tap-triggered iOS/Android strategies. Only the exact built-in relative path can resolve against the current HTTPS origin; absolute destination bytes remain unchanged, and HTTP/offline previews retain ordinary navigation. No private configuration is copied into the demo. Age acknowledgment and branded verification remain disabled in the sample. The standalone snapshot was refreshed and remains script-free.

Validation: **131 Node tests pass**, including URL resolution/fallback boundaries, conservative omitted defaults, sample settings, routing, and verification. One existing Git-index directory-alias test fails with `spawnSync git EPERM`, and another Git-dependent test skips; the full suite is not green in this environment. The configured build, syntax checks, neutral snapshot comparison, and generated-output checks pass. The public-source audit passes for 81 files with Git-index inspection unavailable. Added browser regressions for both simulated mobile platforms using the unchanged sample and real app code, but Playwright's configured web server could not start, so these browser tests remain unexecuted here. No live deployment or physical-device verification was performed. See the [neutral device checklist](testing.md#hosted-example-handoff-check).

## Configurable status pill and optional bio — 2026-10-31

Added an optional static status pill with a decorative green dot, plain-text label, and theme-controlled colors, shape, and spacing. `statusBadge` defaults to disabled; private configuration can enable it without changing the neutral example. An empty or whitespace-only `bio` omits the paragraph, allowing the pill to sit directly below the name. No new scripts, network requests, or live presence tracking are introduced. Both standalone neutral snapshots were refreshed from the shared renderer.

Validation: **65 focused tests pass** across configuration, rendering, synchronization, and verification. Existing validation/escaping checks now cover the badge and empty bio, and the default badge text passes the existing WCAG AA contrast check. The configured build and public-source audit pass, with the existing Git-index inspection limitation. Built-output checks confirm a single profile link, escaped literal text in its label, the status pill replacing the bio, and retained age confirmation. Chromium could not launch, so visual browser inspection remains unverified. No live deployment was performed.

## Private build-secret synchronization — 2026-10-30

Added the operator command `npm run config:sync` to validate the ignored local configuration and upload it directly to the existing production GitHub build trigger as a secret. `--dry-run` is offline; `--deploy` requests a production-branch build after syncing and checking the secret flag. Credentials stay in ignored `.env.cloudflare` or the process environment. Missing/ambiguous production targets, branch mismatches, local-only images, oversized values, and failed validation stop before writing. No CI hooks, runtime key changes, new infrastructure, or private repositories are introduced.

Validation: **35 tests pass** (13 synchronization tests using mocked Cloudflare responses and 22 build tests). The configured offline dry run, syntax check, and diff check pass. The public-source audit passes for 81 files, retaining the existing Git-index inspection limitation. No authenticated API request or live deployment was performed; account credentials still require local setup. The public API's trigger response must be confirmed against the connected Worker on the first live run; unexpected response shapes fail without changing its build settings.

## Publication review — 2026-10-30

Refreshed both standalone neutral pages from the shared renderer so their embedded styles include the age dialog rules and match the CI regeneration check. Aligned the verification-gate specification with primary-only age acknowledgment, which permits same-page browser assistance before the CTA is activated.

The public-source audit passes for 79 files, including comparison against local private display fields and audit terms. Independent Git file-list inspection confirms that the 71 tracked and eight new source files are within the audited public roots, with private configuration, credentials, build output, and reports excluded. Common credential-format scanning and comparison with available local credential values found no matches; values were not printed.

`npm test` passes 10 of 11 test files. In the remaining publication-audit file, six tests pass, one skips because Git subprocesses are unavailable, and the directory-alias test fails with `spawnSync git EPERM`; the full suite is therefore not green in this workspace. The neutral build and Wrangler deployment dry run complete, although Wrangler cannot write its log outside the workspace. Playwright cannot start its configured web server, so browser integration remains unverified here. No live deployment was performed.

## Primary CTA age acknowledgment — 2026-10-29

Added `ageAcknowledgment.scope: primary`: a themed 18+ confirmation dialog on the primary CTA's first ordinary activation, with configurable heading, message, confirm/cancel labels, native focus handling, Escape dismissal, and inline fallback for older webviews. Confirm resumes the intended action once and stores a boolean for this profile/link in the tab session; cancel stores nothing. Secondary links and same-page browser handoff remain available. The default all-link notice is backward compatible, and the public example keeps acknowledgment disabled. Documentation distinguishes self-attestation from access control and describes no-script/modified-click behavior.

Validation: **78 focused Node tests pass** across age acknowledgment, feature configuration, build output, browser strategies, and verification. The configured build, syntax checks, and diff whitespace check pass. Public-source audit passes for 79 files with the existing Git-index inspection limitation. Added Playwright regressions for dialog interactions and app wiring, but Chromium failed to launch in this environment, so those browser checks and visual inspection remain unverified. No deployment was performed.

## Configurable crawl preferences — 2026-10-29

Added optional `robots.allowCrawling` with a backward-compatible permissive default. Disabling it requests no crawling for the entire origin, marks configured profiles noindex, and removes the sitemap on rebuild. The public example stays permissive. The existing Worker exception serves `/robots.txt` without verification cookies or runtime credentials; Cloudflare edge rules remain separately configured and were not changed.

Validation: **59 focused build, configuration, routing, and verification tests pass**, including root/nested crawl policy, stale sitemap removal, example isolation, invalid settings, and anonymous robots access. The configured build and diff whitespace check pass. The public-source audit passes for 79 files; the Git index was unavailable, so it checked known source roots. No live deployment or crawler compliance is claimed.

## Implemented

- The hosted and standalone examples use generic personal copy with no demo notice or publishing panel. Setup instructions remain in documentation; the checked-in screenshots predate this copy/footer update.
- All three example buttons open a shared “More soon” page and can return to the example. Hosted builds emit `/example/more-soon/`; the offline example has a generated `more-soon.html` companion. The exact local placeholder route is allowed only in placeholder mode and never uses native handoff. Focused build/routing verification after this change: 27 tests passed; browser execution remains pending.

- Static rendering, legacy configuration compatibility, separate public/private builds, selective assets, safe public runtime options, and a shared neutral example renderer.
- Native iOS/Android strategies, direct fallbacks, manual assistance, bounded automatic iOS opening, and reload/return guards.
- Optional age acknowledgment, local interaction events, consent-gated GA4, and Cloudflare visit/performance integration. GA4 dispatches at most one page view per document across consent changes, including changes while the provider loads.
- Publication auditing resolves filesystem aliases before comparing Git roots. CI requires Git-index inspection. Private config backups, key bundles, and browser authentication state are ignored and rejected if tracked.
- Browser integration tests exercise the real app and controls using synthetic builds with generated CSP. Neutral mobile/desktop screenshots are included in README, and an isolated performance command records reproducible lab measurements.
- The entry animation keeps content visible from its first frame. Its previous zero-opacity start prevented Chromium from reporting a contentful paint in the measured build; the small translation and reduced-motion behavior remain.
- Workers Static Assets configuration, pinned Wrangler tooling, a deployment dry-run command, and current setup instructions. Private build branch checks support Workers and existing Pages deployments.
- Optional `profilePath` generates a creator below the root alongside a separate platform landing at `/` and neutral demo at `/example/`. The provisional homepage has independent JSON content/styling, optional private `landing` overrides, and a working demo CTA. Legacy root-profile configs retain their behavior. Slugs and private landing branding are included in publication audits.
- Optional branded Turnstile gate with configurable copy/theme, server-side verification, signed sessions, protected document aliases, explicit retry/error states, and no provider dependency on the ordinary links page. The Worker runs before assets; verification remains disabled until runtime credentials and the config toggle are set. Activation and rollback are documented in [verification](verification.md).

## Automatic opening without manual browser offers — 2026-10-28

`showManual: false` now omits Open in Browser from generated profile/gate HTML and suppresses same-page handoff prompts, browser retries and instructions. Automatic attempts remain controlled by `autoOpen`, existing iOS strategy support and loop guards. Explicit CTA attempts retain an exact direct fallback; Android's user-activation requirement and preceding Cloudflare challenges remain unchanged. This does not guarantee automatic opening or establish Meta approval for undocumented schemes.

All **45 focused tests pass**, including omitted controls, gate behavior without a manual button, automatic attempt limits and protected-content enforcement. A profile browser regression fixture was added and syntax-checked; execution retains the previously documented host restrictions. The specification and configuration/operator documentation describe the automatic-only presentation.

## Facebook assistance, verification-page handoff and browser comparisons — 2026-10-28

Added Facebook mobile UA detection alongside Instagram, explicit iOS Chrome strategy, and optional Android OS/default resolution while preserving the Chrome package default. Facebook never invokes Instagram's scheme. The branded gate now offers same-profile browser assistance using the shared strategy/controller, with a bounded optional iOS entry attempt, POST error recovery, original query/fragment preservation and shared loop guards. The gate exposes no creator destination or analytics settings, and the marker never grants verification. Configuration schema, compatibility notes and device checklist were updated.

The crawler command now accepts bundled/full Chromium and installed Chrome/Edge channels, independently of headed/headless mode, and records the selection. No stealth, cookie import, challenge solving or repeated live batch runs were added. A preceding Cloudflare edge challenge still prevents all application handoff code from running; no dashboard protections were changed.

Validation: **56 focused tests pass**. The full Node suite has **101 passes, one failure and one skip**; the failure and skip are the existing Git subprocess restrictions (`spawnSync git EPERM`). The neutral build, public-source audit and syntax checks pass. Playwright integration execution remains unavailable here: the preview server cannot listen (`EPERM`), and a direct full Chromium launch was blocked by a sandbox socket operation. A Facebook gate browser fixture was added with only the OS-launch boundary simulated. No physical Instagram/Facebook/browser-opening compatibility is claimed.

## Controlled crawler check — 2026-10-28

Follow-up startup diagnosis: after the operator installed Playwright and Chromium, a direct launch reproduced missing Linux shared libraries (`libnspr4.so` first; `ldd` also reported NSS and audio libraries). The CLI now distinguishes missing OS libraries from missing browser binaries/display support, and recommends `npx playwright install-deps chromium` for this failure. All seven browser diagnostic unit tests pass, and the real failing launch now emits the correct remedy. Browser execution remains blocked until those system packages are installed; no live browser protection result is claimed.

Added a complementary `npm run check:crawl:browser` diagnostic using fresh Chromium, JavaScript and temporary cookies. It observes automatic page/gate behavior, distinguishes DOM exposure from visual rendering, and saves private JSON/screenshot evidence. It uses normal automation signals and bounded observation without challenge/link clicks. Request interception and redirect limitations are documented. The six browser-policy/report tests and ten HTTP tests pass (**16 total**); source audit and JavaScript syntax checks pass. Six real Chromium fixture tests were added but could not be executed in the agent workspace because Playwright and browser binaries are not installed. No live Chromium result is claimed.

The operator subsequently supplied a live HTTP result showing status 403 with Cloudflare's challenge classification and a Ray ID. That establishes that this single HTTP request was challenged; it did not reach or evaluate the branded gate. It does not establish how JavaScript-capable or Meta crawlers behave.

Added `npm run check:crawl`, an operator-only HTTP diagnostic with at most three sequential GETs, three-second spacing, same-origin redirects, explicit user agent, no cookie reuse, and no challenge solving or outbound-link traversal. Reports stay under ignored `.private/`. All **10 crawler tests pass**, including challenge stops, request limits, redirect boundaries, private-data omission, response size bounds, and distinct network/deployment failures. The public-source audit passes; Git index access retains the earlier host limitation.

One live attempt from the agent environment ended in DNS error `EAI_AGAIN`. No Cloudflare protection result was obtained. The command is ready for the operator to run from their normal terminal; it does not establish how Meta or other browsers/crawlers behave. See [the crawler guide](crawler-check.md).

## Verification form origin fix — 2026-10-28

An operator reported reaching `/_verification/verify` and receiving “Request not allowed” after provisioning the runtime secrets. The gate's `Referrer-Policy: no-referrer` caused an incompatibility with strict origin validation: browsers send `Origin: null` on a form navigation under that policy. The gate now uses `same-origin`, retaining its own form's origin and withholding external referrers. Origin validation remains strict.

All 22 Worker/client tests pass, including the gate-header assertion and existing null/foreign-origin rejection coverage. The browser flow now explicitly asserts the browser-generated POST origin; its syntax check passes, but Chromium/WebKit execution remains unavailable without installed dependencies. After redeployment, the operator reported that verification worked, with a standard Cloudflare challenge appearing before the branded check. This is operator-reported success, not an independently observed browser/device test or evidence of crawler blocking. Removing the duplicate broad edge challenge remains a dashboard configuration task.

## Initial branded verification checks — 2026-10-28

At the time of these initial checks, the feature was implemented locally and had not been deployed or activated. Earlier hosted-demo/CI evidence below predates this change.

- Dependency-free Worker/client tests: **22 passed**, covering config validation, protected routes and internal metadata, nonce/action/hostname checks, token replay, safe redirects, cookie signatures/expiry/rotation, provider failure, retry/address preservation, narrow widget sizing, and static-preview rejection. A separate publication-audit regression checks private verification text while allowing shared defaults.
- Full Node suite: **76 discovered, 74 passed, one skipped, one failed**. Both unavailable checks involve Git subprocesses; the existing directory-alias test fails at `spawnSync git` with `EPERM`. Application tests pass, but the full suite is not green on this host.
- Normal local-config build, explicit neutral build, and standalone example regeneration passed. The checked-in neutral HTML snapshots remain unchanged. Private inputs remain ignored. Public-source auditing passes; Node cannot inspect the Git index on this host, so separate shell Git checks confirm ignored paths.
- Three new Playwright scenarios per Chromium/WebKit project cover real form/cookie flow, direct HTML protection, blocked provider scripts, disabled JavaScript, query/fragment preservation, and mobile layout with a synthetic provider. Syntax checks passed; browser execution and the Wrangler dry run remain pending because dependencies could not be installed (`EAI_AGAIN` reaching the npm registry). No new screenshots or performance results are claimed.
- Real widget completion, custom-domain deployment, WAF interactions, and physical Instagram browser behavior still require the operator's runtime keys and device checks. The default deployment now invokes a Worker for every asset request and is subject to Workers Free request/CPU limits.

## Landing and profile path verification — 2026-10-28

The path change is locally implemented; no new Cloudflare deployment or live path verification was performed in this session. The earlier hosted-demo evidence below refers to the previous release.

- Node 24.18.1, tests run without process isolation: 53 discovered, 51 passed, one skipped because Git subprocesses are unavailable, and one existing Git directory-alias test failed at `spawnSync git` with `EPERM`. This is not a fully passing suite on this host. Routing/build coverage passes for landing/demo/creator isolation, private overrides, invalid configuration preserving old output, reserved paths, legacy roots, real asset reads, SEO, preview handler HTTP behavior, query preservation, and handoff guards.
- Private local and simulated Workers production-branch environment builds produce identical HTML for all three pages. Input values were not printed. The standalone neutral example still matches the shared renderer. The explicit example build produces a neutral landing and `/example/`, ignoring private input.
- Public-source audit passed against ignored local private fields and operator audit terms. Node could not inspect the Git index; separate shell Git checks confirmed the local config, private notes, and generated output are ignored and untracked.
- Browser regression coverage includes nested assets, automatic-handoff reload guards, and the homepage-to-demo journey at 320px with JavaScript enabled and disabled. Syntax checks passed, but browser execution is unavailable because Playwright is not installed here. Screenshots/performance now target the hosted demo at `/example/`; new browser measurements, visual review of the landing, and Workers routing/deployment checks remain pending.

## Earlier release verification

| Check | Result |
| --- | --- |
| Node tests on macOS / Node 22.15.1 | 42 passed, no failures or skips |
| Node tests in Linux / official Node 22 Bookworm container | 42 passed, no failures or skips; repository mounted read-only and container networking disabled |
| Chromium and mobile WebKit integration | 20 passed, including real CTA/manual UI wiring, acknowledgment, loop guards, simulated return, and consent |
| Dependency installation | `npm ci --ignore-scripts --offline --no-audit --no-fund` passed with pinned Playwright and Wrangler dependencies |
| Neutral build and standalone example | Build passed; `example.html` matches the shared neutral renderer |
| Workers deployment | Commit `e109edc` pushed to `main`; Cloudflare Workers Builds reported success on 2026-10-27. Wrangler 4.154.0 dry run also passed |
| Hosted neutral demo | [Public Worker](https://cloudflare-link-protection.skdornel.workers.dev/) checked after deployment: HTTPS 200, security headers, three sample hrefs, updated Worker dropdown, `npm run build`, and no build-variable instructions; Chromium with JavaScript enabled and disabled reported no browser errors. Query-string navigation also passed |
| Hosted missing URL | Browser navigation returns HTTP 404 and renders the custom Page not found document, with JavaScript enabled and disabled |
| Public-source audit | Passed with Git-index inspection; no local production config was available for comparison |
| Screenshots | Neutral 390×844 mobile and 1280×900 desktop Chromium captures generated and visually reviewed |
| GitHub Actions | [Run 40564944633](https://github.com/sdornel/cloudflare-link-protection/actions/runs/40564944633) passed all five jobs: Node 22/24 on macOS and Ubuntu, plus Workers dry run, Chromium/WebKit, screenshots, and performance checks |

For that earlier release, both local verification and the linked remote CI run passed. These results do not cover the new verification Worker. Linux coverage includes Docker and Ubuntu runners; WSL itself was not separately tested. The path fix uses filesystem canonicalization without OS-specific prefix substitutions.

## Performance evidence

`npm run check:performance` measured five fresh Chromium 156.0.8078.4 sessions on macOS 25.2.0 arm64 / Apple M3 Pro / Node 22.15.1. The profile uses a 390×844 viewport, device scale factor 1, 4× CPU slowdown, 150 ms latency, 1.6 Mbps down / 0.75 Mbps up, and disabled cache. Motion is enabled; the loopback server sends uncompressed HTTP. Observations continue for three seconds after load.

- LCP samples: **500, 404, 404, 392, 416 ms**; median **404 ms**, below the 2.5-second lab target.
- Maximum CLS: **0** across all five runs, below 0.1.
- Combined first-party HTML/CSS/JS: **12,803 gzip bytes**, including the 404 page, below 50,000 bytes.

The command writes raw samples, versions, and conditions to ignored `browser-output/performance.json`. This is a local lab measurement, not a deployed-site result or a field percentile. See [testing](testing.md#performance) for reproduction.

## Remaining external release checks

- Verify custom-domain DNS/certificates, optional analytics, and challenge behavior separately from `workers.dev`.
- Record physical iOS/Android Instagram device, OS, and app versions, dates, prompt cancellation, exact destination URLs, and return behavior. Simulated scheme launches and lifecycle events do not establish real OS handoff or BFCache compatibility.
- Complete manual screen-reader, browser zoom/large-text, custom-theme, and real-device usability checks. Automated layout, focus, contrast, and reduced-motion rules do not replace that review.

Use the [deployment guide](cloudflare.md#completing-the-first-hosted-demo-release) and [device checklist](testing.md#real-device-checklist). No conversion gains or successful external-browser loads are inferred from page visibility.
