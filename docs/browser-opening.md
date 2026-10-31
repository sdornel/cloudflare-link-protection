# Browser opening

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
| Instagram or Facebook on Android | Intent to configured browser package, with encoded HTTPS fallback | Tap required; package may be missing; direct alternative remains available |
| Normal Safari, Chrome, Firefox, desktop | Ordinary link | No handoff or browser prompt |
| Unknown in-app browser or uncertain platform | Ordinary link | No unsupported compatibility claim |
| JS/module failure | Original static anchor | Ordinary navigation |

No row above represents real-device verification of this checkout. The scheme is undocumented; [one maintainer's report](https://jhrun.com/2026/07/inappbrowserescaper-v1-0-1-improved-instagram-ios-escape/) describes tap-based iOS behavior, while [another implementer's observations](https://plugwith.me/blog/what-escapes-instagram-in-app-browser-in-2026/) describe an automatic meta-refresh route. Treat these as evidence for an experiment, not a Meta guarantee. Android's documented [intent behavior](https://developer.chrome.com/docs/android/intents) restricts launches without user activation; Instagram's WebView may differ from Chrome.

Chrome documents its iOS [`googlechromes:` scheme](https://chromium.googlesource.com/chromium/src/+/main/docs/ios/opening_links.md). It selects Chrome, not the default browser. Safari's existing scheme remains experimental; [Firefox's own issue tracker](https://github.com/mozilla-mobile/firefox-ios/issues/29563) records it opening Safari from another browser. No supported web API guarantees opening the user's default browser from every app.

On Android, keep `androidPackage: "com.android.chrome"` to request Chrome explicitly. Set it to `"default"` to omit the package and request OS resolution instead. Android may resolve to the default browser, a chooser, or another eligible handler; this does not guarantee escape from the app. See Android's [web intent behavior](https://developer.android.com/guide/components/intents-common#Browser). Other explicit package names retain their existing behavior.

## Automatic opening and loops

`autoOpen: true` opts into one experimental iOS entry attempt to open the **same landing page**, after rendering. It never automatically selects a CTA destination. Android reports a deferred attempt and waits for a tap. Omitted options keep automatic opening off; the public sample explicitly enables it and hides manual browser offers.

The hosted `/example/` uses that sample configuration and the same handoff modules as creator profiles. Its buttons retain `/example/more-soon/` as their real `href`; native attempts on HTTPS resolve that exact built-in path against the current origin. The direct fallback targets the same resolved URL. No creator destination, private configuration, or query-string destination is involved. Ordinary browsers and HTTP previews navigate normally. The standalone `example.html` stays script-free. See the [hosted example checklist](testing.md#hosted-example-handoff-check).

For an existing deployment, merge into the ignored `config/site.json`:

```json
"browserOpening": {
  "mode": "native",
  "autoOpen": true,
  "showManual": false,
  "iosStrategy": "instagram",
  "androidPackage": "com.android.chrome",
  "fallbackDelayMs": 1800
}
```

Keep the rest of the configuration. Rebuild with `npm run build` and deploy with `npx wrangler deploy`; Git-connected builds also require updating their private `SITE_CONFIG_JSON` build secret. A tap or app-menu action can still be required; `autoOpen` is an attempt, not an enforcement setting.

The example above requests **automatic page opening without a manual offer**. With `showManual: false`, neither the profile nor the branded gate contains an Open in Browser button, and an unconfirmed page-opening attempt does not reveal a browser retry/instruction panel. If the phone blocks automatic opening, the current page remains usable. Android page-load attempts remain deferred because they lack user activation; ordinary CTA taps can still use the native strategy. Failed CTA attempts retain their exact direct Continue here link, with browser retry controls and instructions hidden. Set `showManual: true` to restore optional browser assistance.

## Verification and security ordering

When native mode is enabled, the branded verification page uses the same strategies/controller and configurable assistance labels as the profile. When `showManual` is true, its Open in Browser control targets the same profile URL, even after a failed POST. It does not send tokens, cookies, creator destinations or analytics to the external browser. The external browser must satisfy verification itself and may display another challenge.

The initial gate permits one automatic iOS attempt when `autoOpen` is enabled and all-link age acknowledgment is not required. `ageAcknowledgment.scope: primary` leaves this same-page handoff available and asks only when the primary CTA is activated after reaching the profile. Error/POST pages offer manual assistance only if `showManual` is true; all-scope age acknowledgment defers automatic attempts until the profile's acknowledgment flow. The gate/profile share the session/URL loop guard. A handoff marker grants no access.

**A Cloudflare edge challenge comes first.** While it replaces the response, none of our HTML or JavaScript runs, so our assistance cannot appear or open another browser. After it passes, the branded gate can offer assistance before Turnstile finishes. To prioritize assistance on first arrival, an operator would need to reconsider any blanket challenge rule and rely on the branded gate plus targeted edge protections; the app makes no dashboard changes or user-agent exemptions. Keep the double-check setup if desired, accepting this order. See [Cloudflare's challenge-page flow](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/).

Automatic attempts require a visible top-level HTTPS page, no back/forward restoration, and any enabled age acknowledgment. The controller writes a session guard and appends `_lp_handoff=1` to the current page URL before trying. The marker only suppresses another automatic attempt. It grants no access and does not acknowledge age. If neither storage nor history permits a durable guard, automatic opening is skipped.

Existing query serialization and fragments are retained when adding the marker. It is never appended to outbound destinations. An address-bar `url` or `next` parameter cannot select a destination. Reloading, returning from another app, or a failed scheme does not trigger automatic retries.

Android targets containing a fragment or literal semicolon use direct navigation because exact intent parsing is not verified for those cases. Query parameters are otherwise wrapped without merging or re-serializing. No campaign parameters are copied from the page to unrelated links.

## Fallback and manual use

When `showManual` is true, Open in Browser appears only for eligible native-mode visits on HTTPS. The control targets this landing page. CTA handoffs target the configured CTA. Visible fallback panels retain Continue here using the actual target; browser retry and app-menu instructions are only offered when `showManual` is true. No timeout automatically selects another destination.

A page becoming hidden is recorded as an observation. It is not confirmation that a browser opened or a destination loaded. Returning shows assistance without relaunching. One tap launches at most one scheme; modified clicks and new-tab gestures retain normal browser behavior.

Use `mode: direct` as the immediate disable switch if app behavior changes. Test using the [real-device checklist](testing.md#real-device-checklist) before describing a strategy as supported in production.
