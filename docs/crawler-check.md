# Controlled crawler checks

There are two complementary checks: **HTTP** (`check:crawl`) shows what a client without JavaScript receives; **Chromium** (`check:crawl:browser`) executes the page and observes what a fresh automated browser can read. Neither is a recursive spider, load test, or simulation of Meta's infrastructure. Run them against deployments you operate.

## Browser check with JavaScript

Install the existing development dependencies and Chromium once:

```sh
npm ci
npx playwright install chromium
```

Then run:

```sh
npm run check:crawl:browser
```

It uses your configured `siteUrl` and `profilePath`, just like the HTTP check. No build, deployment, Cloudflare API credentials or security-setting changes are needed. To select another deployment or watch the browser on a machine with a graphical display:

```sh
npm run check:crawl:browser -- --url https://links.example.com/sample-creator/
npm run check:crawl:browser -- --headed
```

For a comparison using full Chromium rather than the default headless shell, use:

```sh
npm run check:crawl:browser -- --channel chromium
# With a working graphical display:
npm run check:crawl:browser -- --channel chromium --headed
```

`--channel chrome` and `--channel msedge` use an already installed Linux/system Chrome or Edge, respectively; they do not attach to your personal browser session or import its cookies. `--channel bundled` preserves the original Playwright default. The selected channel and headless/headed mode are recorded in each report. Choose one comparison at a time; these modes retain the same traffic limits and automation signals. Different results indicate differences between these observations, not proof of what Meta can retrieve. Playwright documents [full Chromium's new headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode) and [browser channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge).

Leave the visible browser alone during the check: manually solving a challenge would change what the automated observation establishes. On a Linux host missing browser libraries, Playwright may require `npx playwright install --with-deps chromium` (system package installation needs administrator access).

If Chromium has already downloaded but startup reports a missing shared library such as `libnspr4.so`, install its **Linux system dependencies**, then retry:

```sh
npx playwright install-deps chromium
npm run check:crawl:browser
```

The dependency installer may ask for your sudo password. Downloading Chromium with `playwright install chromium` alone does not install these OS libraries. Our startup error distinguishes this from a missing browser executable or unavailable graphical display; other failures retain a short underlying error and provide a debug command. See [Playwright's system dependency instructions](https://playwright.dev/docs/browsers#install-system-dependencies). npm's separate install-script warnings for `esbuild`/`workerd` do not explain a Chromium shared-library error.

### What it does

- Creates a fresh, nonpersistent Chromium context with JavaScript, the normal automation indicators/user agent and temporary cookies. It imports no existing browser sessions and discards its cookies afterward.
- Navigates once, then observes for up to 20 seconds. Page scripts can automatically complete a check and submit the page's own verification form. The checker never clicks controls, synthesizes tokens, retries manually, changes its identity, or follows discovered anchors.
- Permits the target origin and `challenges.cloudflare.com` resources. It blocks other routed requests, arbitrary POST/PUT/DELETE operations, popups, downloads, service workers and WebSockets. It retains Chromium's native HTTP/TLS stack rather than proxying requests through an HTTP client.
- Stops on exposed profile anchors, rate limits, terminal HTTP errors, a 60-request/six-document budget, or the deadline. Request counts include blocked attempts and redirect hops. **These are best-effort traffic budgets:** Playwright does not route every HTTP redirect, and requests can already be in flight when a limit or external redirect is detected. An observed out-of-scope redirect stops the run, but its target may already have received a request. This tool is not a network sandbox for untrusted pages. See [Playwright routing limitations](https://playwright.dev/docs/api/class-page#page-route).
- Records whether profile anchors are present in the DOM and whether they are rendered. A hidden anchor is still readable by a crawler. Counts do not imply that any destination was visited or that an entire profile was extracted.

Browser startup and screenshot capture can add a few seconds. No automatic reruns occur. Avoid repeatedly rerunning after a block/rate limit; inspect the evidence first.

### Browser evidence and interpretation

Each run creates timestamped **`.private/browser-crawl/<timestamp>.json`** and, when capture succeeds, **`.png`**. The screenshot is the final viewport, not the entire page. JSON contains browser version, headless/headed mode, main-document timestamps/statuses/Ray IDs, aggregate traffic/error counts, challenge/gate observations, final DOM counts and outcome. It does not save HTML, raw headers, request bodies, cookie values, tokens, console messages, destination hrefs or URL queries/fragments. The screenshot can show public deployment content/branding; both files are local private artifacts, ignored by Git. Do not attach them to public issues without reviewing them.

| Browser outcome | Meaning |
| --- | --- |
| `profile_links_exposed` | App profile anchors were present in the rendered document's DOM, including hidden anchors. This particular browser could read them. Inspect `renderedProfileLinks` to distinguish visual display. |
| `cloudflare_challenge` | The latest main-document response carried `cf-mitigated: challenge`, and no profile anchors were observed before the deadline. It does not mean an interactive checkbox was required or that the browser is permanently blocked. |
| `verification_gate` | The branded gate remained without profile anchors at the deadline. `gateState` describes the app's loading/error/expiry state where recognized. |
| `verification_unavailable`, `server_error` | Application/provider/deployment failure, not evidence of effective bot discrimination. |
| `blocked`, `rate_limited`, `http_error` | HTTP denial/error. Inspect statuses and dashboard events; the status alone does not identify a rule. |
| `request_budget_exceeded`, `navigation_budget_exceeded` | The diagnostic's traffic limit stopped observation. This is inconclusive about protection and may indicate a reload loop or resource-heavy page. |
| `external_navigation_stopped`, `redirect_out_of_scope`, `download_stopped` | Navigation or traffic left the intended scope; observation stopped. An HTTP redirect destination might already have received a request. |
| `network_error`, `probe_error`, `inconclusive` | A connection/tool failure or unrecognized page. Do not count it as successful protection. |

`challengeObserved` and `gateObserved` describe earlier observations too: a browser can encounter a challenge, then reach the links automatically. Report only that observed progression; do not label a handoff or verification successful just because a request was attempted. Startup/tool/network failures exit with status 1; other reported outcomes exit 0 because the observation completed, **not** because a security test passed. A missing screenshot is reported explicitly.

Production challenges do not officially support automated browsers. A stock Chromium automation session has different signals from a human visitor, and this check's resource restrictions also affect its behavior. Headed mode still uses automation. A challenged browser does not prove Meta is blocked; a browser that reaches the page does not prove a security bug, since automatic verification can legitimately pass. Cloudflare's [supported-browser guidance](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) describes these limitations. Continue separate real-device checks for Instagram visitors.

The live CLI is disabled in CI. `tests/browser-crawl-check.test.mjs` checks configuration/policy, classifications and report redaction without dependencies. `tests/browser/crawl-check.spec.mjs` exercises the real browser runner against local HTTP fixtures: JavaScript-created/hidden links, ordinary form submission and redirects, isolated cookies, pending challenges, outages, request/navigation limits, and external requests/redirects. Run those fixtures with:

```sh
npx playwright test tests/browser/crawl-check.spec.mjs --project=chromium
```

No fixture contacts a production site or solves a real challenge. They test the observer, not Cloudflare's bot classification.

## HTTP check without JavaScript

Use `npm run check:crawl` to observe what a fresh HTTP client can retrieve from your configured profile. This is a small diagnostic probe for your own deployment, not a recursive spider or load test. It requires Node 22+ and no additional packages or Cloudflare credentials.

```sh
npm run check:crawl
```

The command uses the normal config selection (`SITE_CONFIG_JSON`, then ignored `config/site.json`, then the neutral sample). It requires a configured HTTPS `siteUrl` and includes `profilePath` automatically. For another deployment you own, specify its exact entry URL:

```sh
npm run check:crawl -- --url https://links.example.com/sample-creator/
```

The probe identifies itself as `ProfilePageProbe/1.0`. It makes one GET, following at most two HTTPS redirects on the same origin, with three seconds between requests. Each request has a ten-second timeout and a 256 KiB response inspection limit. It stops at a challenge, error, rate limit, external redirect, loop, or final page. It does not fetch discovered links, execute JavaScript, load images or provider scripts, submit verification tokens, retain cookies, or retry automatically. No Cloudflare configuration is changed.

This volume is deliberately small, but it cannot guarantee Cloudflare will permit a request. Being challenged or blocked can be the expected observation. Avoid repeatedly rerunning it after a challenge or rate limit; inspect the result and dashboard before deciding whether another test is useful. Live checks are disabled when `CI` is set; unit tests use fake responses and never crawl production.

## Reading the result

The terminal prints an outcome and request count. The report at **`.private/crawl-check.json`** records timestamps, HTTP statuses, classifications and Cloudflare Ray IDs when supplied. It overwrites the previous report and stays out of Git. It excludes response HTML, cookies, widget/secret keys, destination hrefs, and query/fragment values. Its origin/path can identify your deployment, so keep the report private.

| Outcome | Meaning |
| --- | --- |
| `cloudflare_challenge` | Cloudflare returned its documented `cf-mitigated: challenge` header. The probe stopped without attempting the challenge. |
| `verification_gate` | The app's branded gate was received. This HTTP client did not attempt Turnstile. |
| `profile_links_visible` | The response contained the app's profile-link markup. If that profile should be gated, investigate; this does not indicate that any outbound destination was visited. |
| `verification_unavailable`, `server_error` | A deployment/provider error; investigate rather than counting it as working bot protection. |
| `blocked`, `rate_limited`, `http_error` | An HTTP denial/error. The status alone does not identify which security feature caused it. |
| `external_redirect_stopped`, `invalid_redirect`, `redirect_loop_stopped`, `redirect_limit_stopped` | The probe stopped without following an unsafe, repeated, or excessive redirect. |
| `other_response` | No recognized gate or profile-link markers. This is inconclusive, especially if `bodyTruncated` is true. |
| `network_error` | DNS, connection, or timeout failure. This is not evidence that Cloudflare blocked the crawler. The command exits with status 1. |

Other outcomes exit with status 0 because the observation completed, not because a security acceptance test passed. The HTML classifications recognize this application's markup; they are not a general-purpose HTML parser or proof of protection.

Find a challenged request under the domain's **Security → Analytics → Events**, matching its timestamp/Ray ID where available. Inspect its Service and rule to identify the first challenge. Free-plan event sampling means a missing event is not proof that no request occurred. A response from the branded gate may have no matching WAF mitigation event because it is enforced by the Worker. See [Cloudflare challenge detection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/) and [Security Events](https://developers.cloudflare.com/waf/analytics/security-events/).

## What this establishes

A result describes one identifiable HTTP client's request from one network at one time. It does **not** demonstrate that Meta, other crawlers, or all automated browsers are blocked, and does not establish Meta policy compliance. Keep a separate real-device check to confirm legitimate Instagram visitors can still reach the links.

Application browser flow tests remain in the existing Playwright suite with a synthetic provider, separate from the live browser diagnostic above. Cloudflare documents that automated browsers may be detected as bots and recommends test keys for deterministic widget testing. Those keys belong in isolated fixtures; the deployable app deliberately rejects them. Do not replace production keys or add a crawler exemption to make a diagnostic pass. See [our verification guide](verification.md#local-verification-and-live-checklist) and [Cloudflare testing guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
