# Browser opening

## Require an external browser before continuing

For an automatic attempt followed by a one-button popup, merge these settings into the complete private `config/site.json` (and the production `SITE_CONFIG_JSON` build secret when using GitHub builds):

```json
"browserOpening": {
  "mode": "native",
  "autoOpen": true,
  "androidAutoOpen": true,
  "requireExternalBrowser": true,
  "showManual": false,
  "androidPackage": "com.android.chrome",
  "iosStrategy": "instagram",
  "fallbackDelayMs": 1800
}
```

In detected mobile Instagram/Facebook browsers, the page requests **this same page** in an external browser once. The app controls whether a leaving-app prompt appears. If the page is still visible after the delay, a branded popup says **Couldn't open in Chrome automatically.**, with one **Open in browser** button and instructions to use the three-dot menu at the top right. Other browser strategies use generic browser wording. A timeout is an unconfirmed attempt, not proof of failure. If no automatic attempt occurred, the heading is **Open this page in your browser** instead.

This opt-in flow has no help, dismiss, copy-link, or Continue here button. The profile is inert until opened in a normal browser. A visitor whose app refuses launches must use its browser menu or leave. `showManual` only controls the older optional inline assistance; it does not suppress this required popup. Set `requireExternalBrowser: false` to restore that optional flow. The public example keeps the optional flow by default.

`src/client/external-browser-dialog.js` shares the handoff controller between the profile and branded verification page. Verification waits until the page opens in an external browser, where a fresh check runs normally. The same-page switch precedes age acknowledgment; the configured age notice still applies to destinations afterward. POST/error pages only offer manual opening of the original GET page. Cloudflare edge challenges may appear before any site script can run.

Customize `browserOpening.labels.externalTitle`, `externalChromeUnconfirmed`, `externalUnconfirmed`, `externalInstructions`, and `externalOpen`. Customize `.external-browser-dialog` and its child rules through `styles.rules`; it inherits the profile's colors. Normal browsers are unaffected, and missing JavaScript retains the static baseline. This is navigation UX, not access control, crawler filtering, or a guarantee of app escape. Menu labels/positions vary between app versions.

The public Instagram/Facebook URL should point to your own landing-page domain. All visitors receive the same page content and the same actual link destinations. User-agent detection only enables navigation assistance.

## Modes

`direct` leaves ordinary HTTPS navigation intact. `native` attempts an external browser for an unmodified tap in a recognized Instagram or Facebook mobile browser. Facebook detection uses FBAN/FBAV markers; a URL's referrer alone never triggers it. Use a link's `openingMode` to override the global mode; `inherit` uses the global setting. Older configurations default to direct.

An ordinary third-party URL, including a Bouncy link, belongs in `url` if you choose to use one. Set that link to `direct` if the service should handle the entire navigation. No service-specific integration or alternate URL mapping is implemented.

## Native mechanisms

| Context | Mechanism | Status / fallback |
| --- | --- | --- |
| Instagram on iPhone/iPad | `instagram://extbrowser/?url=` with the complete encoded target | Experimental; may prompt or be ignored; inline retry/direct link |
| iOS with `iosStrategy: safari` | `x-safari-https://` | Experimental; requests Safari rather than necessarily the default browser |
| Facebook on iPhone/iPad | Safari scheme when `iosStrategy` is `instagram` or `safari` | Experimental; never routes Facebook visitors through Instagram's scheme; manual assistance remains available |
| iOS with `iosStrategy: chrome` | `googlechromes://` | Explicitly requests Chrome; requires it to be installed and the app to allow the launch |
| Instagram or Facebook on Android | Intent to configured browser package; explicit Continue here link on the page | Tap by default; optional automatic attempt may be blocked or prompt; package may be missing; no automatic fallback URL in the intent |
| Normal Safari, Chrome, Firefox, desktop | Ordinary link | No handoff or browser prompt |
| Unknown in-app browser or uncertain platform | Ordinary link | No unsupported compatibility claim |
| JS/module failure | Original static anchor | Ordinary navigation |

No row above represents real-device verification of this checkout. The scheme is undocumented; [one maintainer's report](https://jhrun.com/2026/07/inappbrowserescaper-v1-0-1-improved-instagram-ios-escape/) describes tap-based iOS behavior, while [another implementer's observations](https://plugwith.me/blog/what-escapes-instagram-in-app-browser-in-2026/) describe an automatic meta-refresh route. Treat these as evidence for an experiment, not a Meta guarantee. Android's documented [intent behavior](https://developer.chrome.com/docs/android/intents) restricts launches without user activation; Instagram's WebView may differ from Chrome.

Chrome documents its iOS [`googlechromes:` scheme](https://chromium.googlesource.com/chromium/src/+/main/docs/ios/opening_links.md). It selects Chrome, not the default browser. Safari's existing scheme remains experimental; [Firefox's own issue tracker](https://github.com/mozilla-mobile/firefox-ios/issues/29563) records it opening Safari from another browser. No supported web API guarantees opening the user's default browser from every app.

On Android, keep `androidPackage: "com.android.chrome"` to request Chrome explicitly. Set it to `"default"` to omit the package and request OS resolution instead. Android may resolve to the default browser, a chooser, or another eligible handler; this does not guarantee escape from the app. See Android's [web intent behavior](https://developer.android.com/guide/components/intents-common#Browser). Other explicit package names retain their existing behavior.

The receiving browser chooses whether to use an existing tab or a new one. The app does not request a new tab or open a popup.

## Automatic opening and loops

`autoOpen: true` opts into one experimental entry attempt to open the **same landing page**, after rendering. It never automatically selects a CTA destination. Android additionally requires `androidAutoOpen: true`; otherwise it reports a deferral and waits for a tap. Omitted options keep both flags off; the public sample explicitly enables both and hides manual browser offers.

The Android option tries the existing intent once without a gesture. Chrome documents blocking such launches; [Android WebView navigation](https://developer.android.com/develop/ui/views/layout/webapps/webview#HandlingNavigation) is handled by the host app, so the experiment tests what that app/version permits. It cannot force a browser switch or dismiss a confirmation. An ignored or rejected attempt leaves the current page usable when the host retains it. No synthetic clicks, retries, alternative-package cascade, or success claim is added. Test `/example/` before enabling this in a creator config; existing configs that omit the flag keep tap-based Android behavior.

All Android intents omit `S.browser_fallback_url`, including CTA/manual attempts. [Chrome documents that an unsuccessful launch can load this URL internally](https://developer.chrome.com/docs/android/intents). Supplying More soon as that fallback allowed the first attempt to navigate there silently instead of asking to leave the app. The page retains its original links and an explicit Continue here option after an unconfirmed attempt. The automatic-attempt timer never navigates. Omitting the extra does not guarantee a browser switch or prompt; the host app still decides how to handle the intent.

The hosted `/example/` uses that sample configuration and the same handoff modules as creator profiles. Its buttons retain `/example/more-soon/` as their real `href`; native attempts on HTTPS resolve that exact built-in path against the current origin. The direct fallback targets the same resolved URL. No creator destination, private configuration, or query-string destination is involved. Ordinary browsers and HTTP previews navigate normally. The standalone `example.html` stays script-free. See the [hosted example checklist](testing.md#hosted-example-handoff-check).

Native-enhanced pages load their deferred entry module in the head with `blocking="render"`. Supporting browsers wait to paint until handlers are initialized, avoiding a cold-load first tap that silently follows the static href. Failed or disabled scripts still show the original page and links. Slow scripts can delay the first paint, and older hosts may ignore the attribute. This fixes a reproduced loading race; it does not prove that Instagram will honor an intent or show a prompt.

Android CTA taps use the [documented intent-anchor mechanism](https://developer.chrome.com/docs/android/intents). During an unmodified activation, the controller temporarily puts the validated intent URI on that anchor and lets its default action run. The original href is restored on the next task or when the page hides. No synthetic click or new tab is involved. Duplicate attempts are canceled, and the stored HTTPS destination remains available through Continue here. Automatic attempts, manual buttons and age-confirmation buttons retain the synchronous scripted launch path. Chromium tests distinguish `anchorClick` from `scriptInitiated`; neither confirms that Instagram accepts the navigation.

For an existing deployment, merge into the ignored `config/site.json`:

```json
"browserOpening": {
  "mode": "native",
  "autoOpen": true,
  "androidAutoOpen": true,
  "showManual": false,
  "iosStrategy": "instagram",
  "androidPackage": "com.android.chrome",
  "fallbackDelayMs": 1800
}
```

Keep the rest of the configuration. Rebuild with `npm run build` and deploy with `npx wrangler deploy`; Git-connected builds also require updating their private `SITE_CONFIG_JSON` build secret. A tap or app-menu action can still be required; `autoOpen` is an attempt, not an enforcement setting.

With `requireExternalBrowser` left at its default `false`, the example above requests **automatic page opening without a manual offer**, including the Android experiment. With `showManual: false`, neither the profile nor the branded gate contains an Open in Browser button, and an unconfirmed page-opening attempt does not reveal a browser retry/instruction panel. Ordinary CTA taps can still use the native strategy after an unconfirmed attempt. Failed CTA attempts retain their exact direct Continue here link, with browser retry controls and instructions hidden. Set `showManual: true` to restore optional browser assistance. Set `androidAutoOpen: false` to restore Android tap-only behavior without changing iOS.

## Verification and security ordering

When native mode is enabled, the branded verification page uses the same strategies/controller and configurable assistance labels as the profile. When `showManual` is true, its Open in Browser control targets the same profile URL, even after a failed POST. It does not send tokens, cookies, creator destinations or analytics to the external browser. The external browser must satisfy verification itself and may display another challenge.

The initial gate permits one automatic iOS attempt, or an Android attempt with `androidAutoOpen: true`, when `autoOpen` is enabled and all-link age acknowledgment is not required. `ageAcknowledgment.scope: primary` leaves this same-page handoff available and asks only when the primary CTA is activated after reaching the profile. Error/POST pages offer manual assistance only if `showManual` is true; all-scope age acknowledgment defers automatic attempts until the profile's acknowledgment flow. The gate/profile share the session/URL loop guard. A handoff marker grants no access.

**A Cloudflare edge challenge comes first.** While it replaces the response, none of our HTML or JavaScript runs, so our assistance cannot appear or open another browser. After it passes, the branded gate can offer assistance before Turnstile finishes. To prioritize assistance on first arrival, an operator would need to reconsider any blanket challenge rule and rely on the branded gate plus targeted edge protections; the app makes no dashboard changes or user-agent exemptions. Keep the double-check setup if desired, accepting this order. See [Cloudflare's challenge-page flow](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/).

Automatic attempts require a visible top-level HTTPS page and no back/forward restoration. All-scope age acknowledgment precedes optional opening; in required-browser mode the same-page switch precedes acknowledgment. The controller writes a session guard and appends `_lp_handoff=1` to the current page URL before trying. The marker only suppresses another automatic attempt. It grants no access and does not acknowledge age. If neither storage nor history permits a durable guard, automatic opening is skipped.

Existing query serialization and fragments are retained when adding the marker. It is never appended to outbound destinations. An address-bar `url` or `next` parameter cannot select a destination. Reloading, returning from another app, or a failed scheme does not trigger automatic retries.

The neutral More soon page's Back to example link returns to `/example/?_lp_handoff=1`. This is a fresh page navigation, so it carries the marker explicitly to suppress another arrival attempt even if session storage is unavailable. The offline companion still links directly to `example.html` without scripts.

Android targets containing a fragment or literal semicolon use direct navigation because exact intent parsing is not verified for those cases. Query parameters are otherwise wrapped without merging or re-serializing. No campaign parameters are copied from the page to unrelated links.

## Fallback and manual use

When `showManual` is true, Open in Browser appears only for eligible native-mode visits on HTTPS. The control targets this landing page. CTA handoffs target the configured CTA. Visible fallback panels retain Continue here using the actual target; browser retry and app-menu instructions are only offered when `showManual` is true. No timeout automatically selects another destination.

A page becoming hidden is recorded as an observation. It is not confirmation that a browser opened or a destination loaded. Returning shows assistance without relaunching. One tap launches at most one scheme; modified clicks and new-tab gestures retain normal browser behavior.

A visible-page CTA/manual tap takes priority over an automatic arrival attempt, including one still marked `page_hidden_observed`. Current document visibility determines whether that real tap can launch; a missing/delayed pageshow event must not force the CTA into ordinary in-app navigation. The earlier timer/cleanup is discarded; duplicate explicit attempts stay suppressed until settled. This cannot retract an intent or confirmation already queued by Instagram/Android. Back/return lifecycle events do not initiate a launch in our code; an app-owned delayed prompt needs real-device investigation.

For a phone report, open `/example/?handoff_debug=1`. A local report beneath the buttons shows the client build, detected app/platform, tap activation, lifecycle observations and handoff/fallback events. It retains up to 40 entries across More soon/Back using this tab's session storage; select the report to copy it. With storage blocked, it only covers the current document. It sends nothing to a server and includes no destinations, full URLs, raw user agents or private configuration. Open `/example/?handoff_debug=0` to disable and clear it. The report is unavailable on creator routes and cannot confirm external-browser success.

Use `mode: direct` as the immediate disable switch if app behavior changes. Test using the [real-device checklist](testing.md#real-device-checklist) before describing a strategy as supported in production.
