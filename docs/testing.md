# Verification

## Unit and integration checks

```sh
npm test
npm run build:example
npm run example:refresh
npm run check:public
```

The Node suite covers config precedence/defaults, sanitized errors, exact nested URLs, intent fallbacks, lifecycle/loop guards, static rendering, safe runtime serialization, independent deployments, assets, themes, analytics consent, and repository boundaries. It needs no installation. A restricted host that blocks Node test subprocesses can use:

```sh
node --test --test-isolation=none --test-reporter=spec tests/*.test.mjs
```

The Git fixture test explicitly skips when Git cannot be spawned. CI on a capable host should run it. `check:public` separately reports whether it could inspect the Git index; inspect `git ls-files` and history directly if not. Default audit checks cannot inspect an image's visual content.

## Browser integration

```sh
npm ci
npx playwright install chromium webkit
npm run test:browser
```

Playwright starts a neutral example server, using the same client modules as a configured build. Tests cover ordinary mobile layout, keyboard focus, no-JS navigation, missing modules, inline fallback wiring, and 404 status in Chromium and WebKit. They use synthetic destinations and do not require a provider account. Synthetic UA and scheme failures exercise our code only; they cannot validate Instagram's actual app behavior.

## Browser screenshots

```sh
npm ci
npx playwright install chromium
npm run screenshots
```

This calls the neutral renderer directly and captures `docs/images/demo-mobile.png` and `docs/images/demo-desktop.png`. It cannot select private configuration or browse a production hostname. Inspect both images before committing them, then embed them in README. The CI browser job also uploads neutral screenshot/test evidence when it can run. No screenshots are fabricated when the browser is unavailable.

## Real-device checklist

Record device model, OS, app/browser version, date, config, and expected/observed behavior:

- Open the custom-domain page through a real Instagram bio/story on iOS and Android; confirm the complete landing page is accessible.
- Exercise direct/native modes, per-link overrides, manual Open in Browser, and automatic mode separately. Confirm ordinary Safari/Chrome visitors see no handoff prompt.
- Accept and cancel app prompts; remove/disable the target browser where possible; try another default browser and repeated taps.
- Verify exact query/fragment behavior at a synthetic destination, including encoded values and repeated keys. Android fragment/semicolon targets should remain direct.
- Return, reload, restore from back/forward cache, block storage, and revisit marked URLs. Check for no spontaneous retries or loops.
- Disable JS; block first-party modules and optional provider scripts independently. Actual link hrefs must still work.
- Check screen-reader status, keyboard focus, 320px layout, 200% zoom, reduced motion, and alternate themes.
- Enable acknowledgment, verify one intended action after confirmation, and test a new external-browser storage context.
- Verify consent choices and events. Never count a hidden page or a scheme launch as confirmed success.
- Test HTTPS, real 404s, CSP, custom-domain versus `pages.dev`, and a temporary Cloudflare test challenge. Remove the temporary rule afterwards.

The compatibility matrix remains unverified until this evidence exists. Use `mode: direct` if a platform release breaks its scheme.

## Performance

Measure the neutral build independently of optional vendor scripts and images. Keep first-party HTML/CSS/JS below 50 KB compressed. Measure LCP/CLS using a documented mobile test profile; target LCP ≤2.5s and CLS ≤0.1. Compressed bytes alone do not establish those metrics. Record tool versions, network/CPU assumptions, and actual results. See current [implementation status](implementation-status.md) for what ran in this environment.
