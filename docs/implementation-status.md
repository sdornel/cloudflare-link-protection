# Implementation and verification status

Updated 2026-10-27. The current release scope supports direct/native navigation. Dedicated Bouncy integration is deferred in `SPEC.md`.

## Implemented

- Static rendering, legacy configuration compatibility, separate public/private builds, selective assets, safe public runtime options, and a shared neutral example renderer.
- Native iOS/Android strategies, direct fallbacks, manual assistance, bounded automatic iOS opening, and reload/return guards.
- Optional age acknowledgment, local interaction events, consent-gated GA4, and Cloudflare visit/performance integration. GA4 dispatches at most one page view per document across consent changes, including changes while the provider loads.
- Publication auditing resolves filesystem aliases before comparing Git roots. CI requires Git-index inspection. Private config backups, key bundles, and browser authentication state are ignored and rejected if tracked.
- Browser integration tests exercise the real app and controls using synthetic builds with generated CSP. Neutral mobile/desktop screenshots are included in README, and an isolated performance command records reproducible lab measurements.
- The entry animation keeps content visible from its first frame. Its previous zero-opacity start prevented Chromium from reporting a contentful paint in the measured build; the small translation and reduced-motion behavior remain.
- Workers Static Assets configuration, pinned Wrangler tooling, a deployment dry-run command, and current setup instructions. Private build branch checks support Workers and existing Pages deployments.

## Recorded verification

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

Both local verification and the linked remote CI run passed. Linux coverage includes Docker and Ubuntu runners; WSL itself was not separately tested. The path fix uses filesystem canonicalization without OS-specific prefix substitutions.

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
