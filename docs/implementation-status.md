# Implementation and verification status

Updated 2026-10-28. The current release scope supports direct/native navigation. Dedicated Bouncy integration is deferred in `SPEC.md`.

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

## Branded verification checks — 2026-10-28

This feature is implemented locally, not deployed or activated. Earlier hosted-demo/CI evidence below predates this change.

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
