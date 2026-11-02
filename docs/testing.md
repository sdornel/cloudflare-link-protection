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

For a live observation of an owned deployment, use `npm run check:crawl` for HTTP without JavaScript or `npm run check:crawl:browser` for fresh Chromium with JavaScript and temporary cookies. The latter observes automatic page behavior without clicking challenges or outbound links, and saves a private screenshot plus sanitized report. Both have traffic/time limits and stay separate from live CI. Node tests cover policy/classification/redaction; `tests/browser/crawl-check.spec.mjs` tests the actual runner with local fixtures and no production requests. See [controlled crawler checks](crawler-check.md) for commands, redirect/budget limitations and interpretation.

After `npm ci`, run `npm run check:workers` to build the neutral sample and validate its Wrangler deployment without publishing. Use `npx wrangler dev --local` to inspect Cloudflare static routing, security headers, and real 404 responses locally. Live HTTPS, DNS, and zone rules still need a deployed site.

## Branded verification checks

`tests/verification.test.mjs` builds synthetic profiles and exercises the real Worker with mocked assets/Siteverify. It checks protected document aliases, private metadata, safe return URLs, token replay and action/hostname/nonce binding, signed cookie tampering/expiry/rotation, origin checks, body limits, provider outages, headers, and disabled-feature compatibility. Gated Pages builds and the plain static preview must refuse unenforced output. `tests/verification-client.test.mjs` covers the widget's loading/error/expiry/retry states, one submission, exact address preservation, and compact sizing. These tests require no Cloudflare account or keys.

The Chromium/WebKit verification fixture uses the real gate, client, and Worker with a synthetic widget/provider. It checks form navigation, secure session cookies, query/fragment preservation, direct HTML protection, narrow layout, blocked scripts, and disabled JavaScript. This does not prove live Turnstile or Instagram compatibility. The [activation and device checklist](verification.md#local-verification-and-live-checklist) covers staging and real-device evidence. The deployable Worker rejects official dummy credentials; there is no production verification bypass for tests.

## Primary CTA age acknowledgment

Use a synthetic configuration with `ageAcknowledgment: { enabled: true, scope: "primary", remember: "session" }`. Node tests cover scoping, cancellation, session/path/link isolation, reload aliases, unavailable storage, inline fallback, validation, escaped copy, and preservation of verification-gate handoff. The browser feature suite exercises actual dialog focus/Escape, primary confirmation, direct/native destinations, secondary links, and reload behavior.

On a real device, check:

- Arrival shows the normal links page. Secondary links work without an age prompt. The first primary click opens the themed dialog; the destination has not opened yet.
- Go back and Escape dismiss it without recording acceptance. Focus returns to the CTA. Confirm opens the original destination once, preserving query parameters.
- Return to the same tab and refresh: the next primary click proceeds without a prompt. A genuinely fresh tab session or separate browser asks again; restored/copied browser sessions can retain acknowledgment.
- Storage-disabled mode remembers acknowledgment for the current document only. With JavaScript disabled, the notice and direct links remain available.
- At 320px and 200% zoom, the dialog and both actions remain reachable. Keyboard focus stays inside a native modal until dismissed. Check the configured colors and labels, not only the public theme.

## Browser integration

For the Android first-tap regression, run the focused suite:

```sh
npm ci
npx playwright install chromium
npm run test:handoff
```

On Linux, `npx playwright install --with-deps chromium` also installs the required system libraries. `npm run test:handoff -- --list` lists the cases without starting a browser. This command builds the neutral demo and synthetic required-browser configurations into temporary directories and serves their actual generated files through HTTPS test routing; it does not rebuild `dist`, read private configuration, contact the live domain or deploy anything.

The suite uses Android touch emulation and real trusted taps. CDP observes actual renderer navigation requests from the production launch code; it does not replace the launch function or infer a request from our analytics. Android CTA checks require the `anchorClick` reason, rejecting a scripted redirect even if its intent URI is correct. They cover first tap while arrival is pending, after its timeout, after a simulated stale pagehide, and with session storage blocked. Each case follows Continue here → More soon → Back to example → first returning tap. Assertions reject silent in-app navigation, extra native attempts and popups, and check the exact destination and restoration of the original href. Keyboard activation exercises the same default link action. Ordinary Chrome and unavailable-entry-script cases retain direct navigation.

Cold-load cases start before initialization and hold either the entry script or a dependency. They use the real browser clock and Paint Timing entries to verify that an unwired CTA is not painted while loading, then test the first visible tap without waiting for an application readiness event. Separate checks verify that a failed dependency and disabled JavaScript still paint a usable static page. Lifecycle tests use controlled timers; paint tests must not use Playwright's fake Performance implementation.

These are browser integration tests, not an Android/Instagram OS test: a recorded `intent:` request does not establish that Chrome opened or a leave-page prompt appeared. The synthetic pagehide is a controlled regression input, not a device observation. [Playwright's Android support](https://playwright.dev/docs/api/class-android) requires a connected device/emulator and ADB; desktop mobile emulation does not provide that environment. Follow the real-device checklist for prompt behavior.

CI runs the focused suite on pushes and pull requests. Failure traces/screenshots and `navigation-requests.json` are saved under ignored `test-results/handoff/`, with the HTML report under `playwright-report/handoff/`; the browser job uploads those neutral artifacts. Open a local report with `npx playwright show-report playwright-report/handoff`. A browser startup failure is a failed run, never passing compatibility evidence. Restricted environments can fail with `sandbox_host_linux.cc` / `Operation not permitted` before any assertions execute; use a normal local terminal or CI in that case.

The broader cross-browser suite is separate:

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

## Required-browser flow on a phone

Enable `requireExternalBrowser`, `autoOpen`, and `androidAutoOpen` in a native-mode test deployment. This flow is separate from the default hosted example below.

1. Open the configured HTTPS profile from a fresh Instagram session on Android. Record whether Instagram offers its leaving-app prompt; its wording and appearance are outside the site's control.
2. If still in the app, expect the Chrome popup after the configured delay, with exactly one **Open in browser** button and the top-right three-dot menu instructions. There must be no help, dismiss, or Continue here control.
3. Tap once. Check whether Chrome opens the same profile with the original query parameters and `_lp_handoff=1`. If the app refuses, verify its menu can open the page. Returning or reloading must not launch automatically again.
4. In Chrome, expect no browser popup. Complete any verification, then confirm that the primary age acknowledgment still appears before its configured destination.
5. Repeat with Facebook, iOS Instagram, and ordinary Safari/Chrome. iOS should use generic browser wording. Test a canceled launch and a device without the configured Android browser; the popup should remain usable, although app restrictions may prevent continuation.
6. With branded verification enabled, check that its widget does not start behind the popup, and does work in the external browser. Cloudflare's outer challenge may still precede the site.

`tests/browser/external-browser.spec.mjs` covers the generated profile/gate popup, first trusted tap and keyboard intent dispatch, timeout/return/reload guards, blocked storage, unsupported URL preservation, no-JS baseline, age sequencing, normal browser verification, failed POST recovery, and a missing browser module. iOS UA cases exercise classification in Chromium; they do not constitute WebKit or physical-device launch tests. Synthetic Turnstile responses test application wiring, not Cloudflare bot classification.

## Hosted example handoff check

Deploy the updated build, then use `/example/` on your own HTTPS origin. Its sample settings enable native mode, automatic opening, and the separate `androidAutoOpen` experiment while hiding the manual browser button. All destinations remain the neutral More soon page; no private configuration update is needed for this demo change. Age acknowledgment and the branded gate stay disabled, so this check does not exercise those features. Domain-level Cloudflare challenges may still precede the page.

1. Start a fresh Instagram/Facebook in-app browsing session at `/example/` without a `_lp_handoff` marker. An earlier visit in the same session can suppress another automatic attempt by design.
2. On iOS, observe whether the same example page opens externally, prompts, or stays in the app. Refreshing or returning must not create repeated automatic launches. Record the actual browser; an attempt alone is not proof of success.
3. On Android, use a URL without a fragment or literal semicolon, which the intent strategy intentionally declines. Observe the single arrival attempt: Chrome may open the same example page, the app may show a confirmation/error, or it may remain inside the app. The automatic intent must not include a self-redirect fallback. Confirm there is no repeat on refresh or return. If still inside the app, tap Explore my work once without visiting More soon and returning first: the app should issue one intent for the same-origin `/example/more-soon/` during that tap. Test once immediately after arrival and once after the arrival timeout in a fresh session. Record whether Chrome actually opens, a confirmation appears, or More soon loads inside Instagram; these are distinct outcomes. The receiving browser chooses the tab. With `androidAutoOpen: false`, expect no attempt before a tap.
4. A native attempt must not include `S.browser_fallback_url` or navigate to More soon through a controller fallback. If it is unconfirmed, Continue here should become available and reach More soon when tapped. There should be no Open in Browser button or browser retry/instruction offer. More soon must not attempt another handoff.
   Use its Back to example link, including with session storage blocked: it should return to `/example/?_lp_handoff=1` and initiate no new browser-opening attempt.
5. Check all three links in normal Safari/Chrome and with JavaScript disabled. They should navigate directly to More soon. HTTP localhost and offline snapshots cannot test native opening.

For a repeatable phone trace, use `/example/?handoff_debug=1` before the first tap. The local report below the buttons records build/version and handoff/lifecycle events and survives the More soon/Back link when session storage works. Copy it after reproducing the problem. A `handoff_attempt` records our attempt, not a confirmed external launch. Missing diagnostics entirely can indicate an old deployment or that JavaScript has not initialized. Clear the report with `/example/?handoff_debug=0` before another independent run.

Automated checks cover HTTPS resolution of the exact built-in path, unchanged absolute URLs, rejected alternative relative URLs, sample feature flags, and conservative omitted defaults. `tests/app-opening.test.mjs` exercises the real app/controller with modeled DOM events and timers: the first CTA issues its intent before, during, and after the arrival attempt, including a stale pagehide observation on a visible document, and its direct fallback remains usable. It does not simulate Android's navigation policies. Browser fixtures exercise the hosted sample's real app code with simulated iOS/Android contexts and only the OS launch boundary replaced; physical devices remain necessary for compatibility evidence.

## Real-device checklist

Record device model, OS, app/browser version, date, config, and expected/observed behavior:

- Open the custom-domain page through real Instagram and Facebook links on iOS and Android; verify browser assistance on both the branded gate and profile. Record whether an earlier Cloudflare edge challenge delays assistance.
- Test automatic entry, a manual Open in Browser tap, failed verification POST recovery, and retry/return loop guards. Verify the actual browser that opens; include Chrome missing and a different default browser. A UA fixture cannot establish these device results.
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
