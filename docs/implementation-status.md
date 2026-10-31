# Implementation and verification status

Updated 2026-10-31. The current release scope supports direct/native navigation. Dedicated Bouncy integration is deferred in `SPEC.md`.

## Publication checks — 2026-10-31

The complete Node suite passed: 152 tests, no failures or skips. The public-source and Git-index audit passed with private deployment configuration excluded. Earlier focused browser results and broader-suite limitations are recorded below. The operator subsequently confirmed that opening the explicit HTTPS creator address worked.

An attempt to synchronize the current private configuration to the production GitHub build secret was denied by Cloudflare's API permissions. The existing Wrangler login can deploy Workers but did not authorize this build-settings update; the separate local sync credential is not configured. Direct deployments use the updated local configuration. GitHub-triggered deployments still require the production `SITE_CONFIG_JSON` secret to be kept in sync through the dashboard or a token with the documented Workers CI permissions.

## Same-domain HTTPS upgrade deployed — 2026-10-31

The operator reported the configured-domain error on the creator route. Local configuration and the deployed build target the correct HTTPS origin, and the production deployment was current. Reproduced the exact error with an HTTP request against the built manifest; the operator's reported address did not identify its scheme. Live automated requests received the outer Cloudflare challenge, so the original device request's scheme was not confirmed.

Protected GET/HEAD requests now receive a bodyless, non-cacheable 308 when upgrading their scheme yields exactly the configured HTTPS origin. Path/query bytes remain intact; alternate hosts/ports still return 421, and verification POSTs are not redirected. No verification cookies or content are issued on HTTP. All 22 verification tests, the configured build and public-source/Git-index audit passed. Built and deployed the Worker change. The post-deployment live request still encountered the outer challenge; end-to-end device confirmation remains pending.

## Deployment verified — 2026-10-31

At the operator's request, built the current ignored local configuration with `npm run build` and deployed the configured Worker with `npx wrangler deploy`, using `dist`. The custom domain's public example now references client `204d434fcc6f` from the document head. Both the live app and handoff-controller returned HTTP 200 and matched the built files byte for byte. This verifies publication of the Android intent-anchor change; physical Instagram/Android acceptance remains unconfirmed.

## Android CTA default link activation — 2026-10-31

The operator still observed the first-tap failure on Android after deploying the loading fix. A fresh public HTML check confirmed the head module and `blocking="render"` were live; deployment staleness is not assumed. The preceding race fix therefore did not establish resolution of the Instagram behavior.

Android CTA handling now allows the real anchor's default action with a temporarily assigned validated intent URI, instead of canceling the click and calling `location.assign`. The controller restores the original href on the next task/lifecycle cleanup. The event binding retains the original target; duplicate and failed attempts cancel default navigation. iOS, automatic attempts, manual buttons and age-confirmation launches retain their existing paths. No configuration changes or new-tab behavior were introduced.

A new CDP assertion failed against the previous code with `scriptInitiated` and passes with `anchorClick`. All 11 focused cases passed across the ten-case suite plus keyboard activation. Forty focused Node tests passed, including duplicate activation, href restoration and preparation failure. All 14 Chromium enhancement cases passed, covering age prompts, iOS, analytics and fallback UI with their existing simulated OS boundary. The configured build and public-source/Git-index audit passed. The broader suite limitations recorded below remain unresolved. Real Instagram/Android acceptance remains unverified: these results establish a different browser request, not successful OS handoff. No deployment was performed.

## Cold-load first-tap race — 2026-10-31

Checked the public deployed example in Chromium with Android/Instagram context emulation. With scripts initialized, the diagnostic panel appeared and the first trusted tap requested the expected intent, both with and without the arrival guard. Holding the entry-script request reproduced the reported sequence against the live page: the CTA was painted without diagnostics/handlers; its first tap navigated directly to More soon with no intent; Back to example followed by another tap requested an intent. This establishes a loading race, not the cause of every real Instagram failure. No Android device or Instagram app was available for OS-prompt confirmation.

The renderer now puts its deferred module in the document head and uses `blocking="render"` when navigation or age handlers are needed. Supporting browsers initialize before first paint. Analytics-only pages do not block rendering; failed or disabled scripts retain static navigation. This adds first-paint latency while scripts load and is subject to host support/timeouts. Automatic arrival settings, destination URLs and private configuration are unchanged. The standalone snapshot was refreshed and remains script-free.

Two new real-clock paint regressions failed against the previous renderer, then passed with the change. **All 10 focused cases passed** across the nine-case suite and a subsequent disabled-JavaScript case. These include delayed entry/dependency loading, first visible trusted taps, explicit fallback, failed dependencies, and disabled scripting. Focused Node build/routing/verification/app/diagnostic checks also passed.

The broader Chromium/WebKit run reported 26 passed, six intentional skips, and 28 failures: 24 were missing-WebKit startup failures; four were Chromium verification/crawler checks. Their traces show an unrouted request after a synthetic verification 303 redirect, an empty noscript locator, and a fixture cookie absent from its POST (the fixture omits `Path=/`). These failures remain unresolved and the broad suite is not certified passing. Installed the WebKit browser, but Linux dependency installation stopped because sudo requires interactive authentication. No WebKit assertions or physical-device success are claimed. No deployment was performed.

## Verified Playwright handoff run — 2026-10-31

After the session permitted a sandbox exception, Chromium started and the focused suite completed successfully: **6 passed (4.4s)**. Executed `npm run test:handoff -- --reporter=line --output=/tmp/handoff-approved-run`, preserving the operator's earlier reports. The pending-arrival, timed-out-arrival, stale-pagehide and blocked-storage cases all completed the first tap → explicit Continue here → More soon → Back to example → returning tap sequence. Ordinary Android Chrome and unavailable-entry-script cases also passed.

This run verifies the corrected return-navigation wait, real renderer intent requests from unchanged client files, trusted tap activation, exact destinations, explicit fallback, loop prevention and absence of popups. Android context and lifecycle inputs are simulated in desktop Chromium. Physical Instagram/Android prompt and OS handoff verification remain pending; no deployment was performed.

## Playwright return-navigation wait — 2026-10-31

The operator ran the focused suite locally and reported five failures and one pass. Inspected all five saved traces: each terminal error was `page.evaluate: Execution context was destroyed, most likely because of a navigation` in `ready()` immediately after Back to example. The four native cases completed their first-tap intent, destination, activation, fallback and no-popup assertions before failing on return; ordinary Chrome hit the same readiness race. This is a test synchronization defect, not five independently established application failures.

Both return paths now use a shared helper that starts a wait for the exact return URL and DOMContentLoaded alongside the touch tap, then checks readiness in the new document. No assertions were removed or weakened, and production code was not changed for this fix. Syntax, six-test discovery and whitespace checks pass. An initial rerun used separate `/tmp` output to preserve the operator's traces but Chromium failed before assertions with `sandbox_host_linux.cc:41` / `Operation not permitted`. The later approved run above verified all six cases successfully.

## Unmodified-client Playwright handoff suite — 2026-10-31

Added `npm run test:handoff`, with six Chromium cases covering pending/timed-out automatic arrival, stale pagehide, blocked session storage, ordinary Android Chrome and an unavailable entry script. Each native case checks the first trusted tap and follows explicit Continue here → More soon → Back to example → another tap. The suite serves unchanged neutral build files with their CSP, observes real renderer navigation requests through CDP, and checks exact destinations, no silent fallback, no extra launch or popup, and the return guard. It does not replace `defaultLaunch` or `location.assign`. Application timers are controlled; native input remains real and the stale lifecycle event is explicitly simulated.

The focused config needs no preview server and never writes deployment output. CI runs it alongside the existing integration suite and retains neutral failure traces, screenshots, HTML reports and navigation-request JSON. These checks observe requests to launch, not successful OS handoffs or Instagram confirmation dialogs.

Initial validation: test discovery listed all six cases; the existing broader suite separately listed 60 cases without duplicates. Syntax/whitespace checks and the public-source audit passed (86 files; Git index access unavailable). Report destinations are resolved explicitly outside source directories, and each suite has its own result directory. The first command was attempted with `--max-failures=1`; Chromium failed at startup with `sandbox_host_linux.cc:41` / `Operation not permitted` before any test assertions ran. Playwright reported one startup failure and five cases not run. See the later entries above for the operator's run, return-wait correction and successful six-case execution.

## First CTA after a stale arrival lifecycle observation — 2026-10-31

The operator clarified that the first tap automatically navigates to More soon; returning with Back to example and tapping again produces a leave-page prompt. Reproduced a code path with the same visible outcome: an automatic attempt records pagehide, the document is visible without a subsequent pageshow/visibilitychange, and the first CTA returns false from the controller, causing a plain HTTPS navigation. A new app/controller regression failed before the fix. A visible CTA/manual tap now supersedes that stale automatic state as well as a pending attempt. Hidden documents remain unable to supersede it. This reproduction establishes a defect in our state handling, not that this precise event ordering occurred on the phone.

Android intents also no longer include `S.browser_fallback_url` on CTA/manual launches. That extra explicitly allowed the host to load More soon internally when it declined the handoff. The target remains unchanged in the plan, original anchor and user-selected Continue here link. Automatic attempts, the return-link guard and ordinary-browser navigation remain intact; no new-tab behavior was reintroduced.

Added an opt-in, local-only example diagnostic report with build identity, classified context, user activation, lifecycle observations and sanitized handoff events. It carries up to 40 entries through the More soon/Back round trip using session storage, works in memory if storage is unavailable, and is disabled on creator paths. This provides evidence for further device reports instead of treating synthetic intent dispatch as proof of a browser switch.

Validation: **104 focused Node tests pass**, including the failing-before/fixed-after lifecycle regression, original target preservation, explicit fallback use, configuration/build isolation, verification and diagnostic bounds/privacy. The configured build, syntax and whitespace checks pass. The public-source audit passes for 84 files; Git index access remains unavailable. A matching Playwright sequence and diagnostic-report assertions were added and syntax-checked, but Chromium startup failed in this environment. The live example could not be fetched here (terminal DNS failure and browsing-tool access failure). No deployment or physical-device confirmation was performed.

## Android arrival fallback and tab behavior — 2026-10-31

Removed the new-tab experiment from configuration, runtime options and Android intents at the operator's request. Browser tab selection now stays with the receiving browser. The private config was not changed.

The operator reports that the first CTA still opens inside Instagram while a repeat after Back can request Chrome. Automatic Android intents previously supplied the current page as `S.browser_fallback_url`, allowing a blocked arrival attempt to reload it. They now omit that extra on both profile and verification pages; explicit CTA/manual intents retain their exact HTTPS fallback. Chromium documents restrictions on app launches from fallback URLs, making the self-redirect an avoidable source of interference, but its role on the operator's phone is unconfirmed. Automatic attempts, pending-attempt supersession and the neutral return-link guard remain enabled.

Added app/controller regression coverage for a first tap before arrival, during its pending interval, and after its timeout, along with normal Chrome navigation and direct fallback use. These tests exercise the real synchronous location-assignment path with modeled DOM events; they do not establish that Instagram allows the intent. No deployment or physical-device confirmation was performed.

Validation: **99 focused Node tests pass** across the app, strategies/controller, feature validation, builds, profile routing, age acknowledgment and verification. The configured build, syntax checks and whitespace check pass. The public-source audit passes for 82 files, with Git index access still unavailable. The browser fixture was updated and syntax-checked; Playwright was not rerun because of the previously recorded browser/server execution restriction.

## Neutral return-link guard — 2026-10-31

The reported Back action was clarified as the More soon page's Back to example link, which starts a fresh navigation. That link previously dropped the URL attempt marker, leaving suppression dependent on session storage. It now carries `_lp_handoff=1` so returning cannot initiate another arrival attempt even when storage is unavailable or lost. The standalone companion remains script-free and keeps its ordinary file link. This closes a reproducible guard gap; it does not establish which deployment or host-app behavior caused the observed phone prompt.

Validation: **47 focused Node tests pass** across builds, routing, and browser opening. Routing checks verify the generated marked return URL, successful HTTP handling, and guard recognition; the existing controller regression checks marked URLs with unavailable storage. Browser fixtures now cover returning via the actual link with storage blocked, but remain unexecuted due to the previously observed Playwright server restriction. The configured build and standalone snapshot comparisons pass. No live deployment or new physical-device verification was performed.

## Explicit tap during a pending arrival attempt — 2026-10-31

Reproduced a controller race: a CTA for a different destination during the automatic attempt's pending interval returned false, causing the app to navigate directly inside the current browser. A visible-page CTA/manual tap now supersedes that pending automatic attempt synchronously. Old timers/cleanup are discarded, stale callbacks cannot affect the replacement, and duplicate explicit attempts remain suppressed. Back/visibility restoration still shows fallback without initiating another launch. This cannot cancel a prompt already owned by the host app.

Validation: **33 focused tests pass** across handoff strategy/controller, verification-page opening, and age acknowledgment, including the new overlap and hidden-page regressions. Build, syntax, whitespace, and public-source checks pass, with the existing unavailable Git-index audit. An Android report of a prompt appearing after Back remains unconfirmed: deployment version and the exact button/Back sequence are still needed. This fix is not claimed to reproduce or resolve that host-app prompt. No live deployment or physical-device verification was performed.

## Experimental Android arrival attempt — 2026-10-31

Added `browserOpening.androidAutoOpen`, defaulting to false. Together with native mode and `autoOpen`, it permits one Android intent to the guarded current page on arrival, including on an initial branded verification gate. The intent fallback targets that same guarded URL; session/URL loop prevention, ordinary CTA handling, conservative fragment/semicolon handling, and verification POST/error exclusions remain in place. Only the public sample enables the experiment; existing private configurations continue to defer Android entry until a tap. The host app may reject the launch or display a confirmation/error. No physical-device success has been established.

Validation: **135 Node tests pass**, including new option validation/defaults, guarded Android intent fallbacks, one-time gate attempts, and POST/error exclusions. The existing Git-index directory-alias test fails with `spawnSync git EPERM`; one other Git-dependent test skips. Build, syntax, snapshot comparisons, generated sample/private option isolation, whitespace checks, and the public-source audit pass, with Git-index inspection unavailable. Browser regressions were updated for the hosted sample's Android arrival attempt, but Playwright's configured web server could not start. The configured build was restored after that attempt. No live deployment was performed; use the [hosted example checklist](testing.md#hosted-example-handoff-check) after deploying.

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
