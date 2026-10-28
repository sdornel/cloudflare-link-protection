# Verification

## Unit and integration checks

```sh
npm test
npm run build:example
npm run example:refresh
npm run check:public
```

The Node suite covers config precedence/defaults, sanitized errors, exact nested URLs, intent fallbacks, lifecycle/loop guards, static rendering, safe runtime serialization, independent deployments, assets, themes, analytics consent, and repository boundaries. Profile-path tests cover landing/demo/creator isolation, private landing overrides and validation, actual emitted asset resolution, SEO, invalid routes, preview HTTP handler redirects/404s/HEAD, and query-preserving handoff. They call the HTTP handler with request/response fixtures, so no listening socket is needed. It needs no installation. A restricted host that blocks Node test subprocesses can use:

```sh
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
```

The Git fixture test may explicitly skip outside CI when Git cannot be spawned. CI requires Git and fails if index inspection is unavailable. Unit/build checks run on macOS and Linux with Node 22 and 24. A directory-symlink regression verifies that Git index inspection survives filesystem aliases on either OS. `check:public` separately reports whether it could inspect the Git index; inspect `git ls-files` and history directly if not. Default audit checks cannot inspect an image's visual content.

## Workers deployment check

After `npm ci`, run `npm run check:workers` to build the neutral sample and validate its Wrangler deployment without publishing. Use `npx wrangler dev --local` to inspect Cloudflare static routing, security headers, and real 404 responses locally. Live HTTPS, DNS, and zone rules still need a deployed site.

## Browser integration

```sh
npm ci
npx playwright install chromium webkit
npm run test:browser
```

Playwright starts a neutral build server; the landing is at `/` and the profile demo at `/example/`, using the same client modules as a configured build. Landing tests follow the demo link with and without JavaScript. Tests cover ordinary mobile layout, keyboard focus, no-JS navigation, missing modules, and 404 status in Chromium and WebKit. Synthetic HTTPS feature builds exercise the real app initialization and CTA/manual controls, exact fallback destinations, retry/dismiss, acknowledgment with blocked storage, automatic-loop guards, Android gesture deferral, return lifecycle, and analytics consent changes. Their generated CSP is applied; only the OS launch boundary and analytics provider response are mocked. Return events are simulated, not a claim of actual OS or BFCache behavior. They use synthetic destinations and do not require a provider account. Synthetic UA and scheme failures exercise our code only; they cannot validate Instagram's actual app behavior. On macOS the WebKit focus check uses [Safari’s Option-Tab shortcut](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac) to include links.

## Browser screenshots

```sh
npm ci
npx playwright install chromium
npm run screenshots
```

This builds and serves the neutral sample in an isolated temporary directory, then captures `/example/` in `docs/images/demo-mobile.png` and `docs/images/demo-desktop.png`. It cannot select private configuration or browse a production hostname. Inspect both images before committing them. The reviewed captures are embedded in README. The CI browser job also uploads neutral screenshot/test evidence when it can run. No screenshots are fabricated when the browser is unavailable.

## Real-device checklist

Record device model, OS, app/browser version, date, config, and expected/observed behavior:

- Open the custom-domain page through a real Instagram bio/story on iOS and Android; confirm the complete landing page is accessible.
- For a configured profile path, visit both `/sample-creator` and `/sample-creator/` with query parameters; verify the creator page, portrait, stylesheet, and modules load. Check the root shows the landing, its demo button opens `/example/`, and unknown paths return 404. Repeat after a direct reload and without JavaScript.
- Exercise direct/native modes, per-link overrides, manual Open in Browser, and automatic mode separately. Confirm ordinary Safari/Chrome visitors see no handoff prompt.
- Accept and cancel app prompts; remove/disable the target browser where possible; try another default browser and repeated taps.
- Verify exact query/fragment behavior at a synthetic destination, including encoded values and repeated keys. Android fragment/semicolon targets should remain direct.
- Return, reload, restore from back/forward cache, block storage, and revisit marked URLs. Check for no spontaneous retries or loops.
- Disable JS; block first-party modules and optional provider scripts independently. Actual link hrefs must still work.
- Check screen-reader status, keyboard focus, 320px layout, 200% zoom, reduced motion, and alternate themes.
- Enable acknowledgment, verify one intended action after confirmation, and test a new external-browser storage context.
- Verify consent choices and events. Never count a hidden page or a scheme launch as confirmed success.
- Test HTTPS, real 404s, CSP, custom-domain versus `workers.dev`, and a temporary Cloudflare test challenge. Remove the temporary rule afterwards.

The compatibility matrix remains unverified until this evidence exists. Use `mode: direct` if a platform release breaks its scheme.

## Performance

Run `npm run check:performance` after installing Chromium. It builds the neutral sample in a temporary directory, starts a loopback HTTP server, and runs five fresh Chromium contexts at 390×844 CSS pixels, device scale factor 1, 4× CPU slowdown, 150 ms latency, 1.6 Mbps download, and 0.75 Mbps upload. Cache is disabled. The local server sends uncompressed responses; gzip size is measured separately. Optional providers and portraits remain disabled.

The script observes LCP and the maximum CLS session window until three seconds after load. It fails on missing LCP observations, median LCP above 2.5 seconds, CLS above 0.1, or combined first-party HTML/CSS/JS at or above 50,000 gzip bytes. The byte budget conservatively includes both the landing and demo plus the 404 document; LCP/CLS observations target `/example/`. Default motion stays enabled; the entry animation moves already-visible content, avoiding an initially invisible page. See [LCP measurement and eligibility](https://web.dev/articles/lcp).

The ignored `browser-output/performance.json` records all five results, tool/host versions, and the test profile. CI uploads it with neutral screenshots. This is a reproducible local lab check, not a field percentile or Cloudflare result; repeat it on the deployed demo and record physical-device behavior separately. Current measurements are in [implementation status](implementation-status.md).
