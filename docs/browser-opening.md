# Browser opening

The Instagram profile URL should point to your own landing-page domain. All visitors receive the same page content and the same actual link destinations. User-agent detection only enables navigation assistance.

## Modes

`direct` leaves ordinary HTTPS navigation intact. `native` attempts an external browser for an unmodified tap in a recognized Instagram mobile browser. Use a link's `openingMode` to override the global mode; `inherit` uses the global setting. Older configurations default to direct.

An ordinary third-party URL, including a Bouncy link, belongs in `url` if you choose to use one. Set that link to `direct` if the service should handle the entire navigation. No service-specific integration or alternate URL mapping is implemented.

## Native mechanisms

| Context | Mechanism | Status / fallback |
| --- | --- | --- |
| Instagram on iPhone/iPad | `instagram://extbrowser/?url=` with the complete encoded target | Experimental; may prompt or be ignored; inline retry/direct link |
| iOS with `iosStrategy: safari` | `x-safari-https://` | Experimental; requests Safari rather than necessarily the default browser |
| Instagram on Android | Intent to configured browser package, with encoded HTTPS fallback | Tap required; package may be missing; direct alternative remains available |
| Normal Safari, Chrome, Firefox, desktop | Ordinary link | No handoff or browser prompt |
| Unknown in-app browser or uncertain platform | Ordinary link | No unsupported compatibility claim |
| JS/module failure | Original static anchor | Ordinary navigation |

No row above represents real-device verification of this checkout. The scheme is undocumented; [one maintainer's report](https://jhrun.com/2026/07/inappbrowserescaper-v1-0-1-improved-instagram-ios-escape/) describes tap-based iOS behavior, while [another implementer's observations](https://plugwith.me/blog/what-escapes-instagram-in-app-browser-in-2026/) describe an automatic meta-refresh route. Treat these as evidence for an experiment, not a Meta guarantee. Android's documented [intent behavior](https://developer.chrome.com/docs/android/intents) restricts launches without user activation; Instagram's WebView may differ from Chrome.

## Automatic opening and loops

`autoOpen: true` opts into one experimental iOS entry attempt to open the **same landing page**, after rendering. It never automatically selects a CTA destination. Android reports a deferred attempt and waits for a tap. Defaults keep this option off.

Automatic attempts require a visible top-level HTTPS page, no back/forward restoration, and any enabled age acknowledgment. The controller writes a session guard and appends `_lp_handoff=1` to the current page URL before trying. The marker only suppresses another automatic attempt. It grants no access and does not acknowledge age. If neither storage nor history permits a durable guard, automatic opening is skipped.

Existing query serialization and fragments are retained when adding the marker. It is never appended to outbound destinations. An address-bar `url` or `next` parameter cannot select a destination. Reloading, returning from another app, or a failed scheme does not trigger automatic retries.

Android targets containing a fragment or literal semicolon use direct navigation because exact intent parsing is not verified for those cases. Query parameters are otherwise wrapped without merging or re-serializing. No campaign parameters are copied from the page to unrelated links.

## Fallback and manual use

Open in Browser appears only for eligible native-mode visits on HTTPS. The control targets this landing page. CTA handoffs target the configured CTA. The inline assistance panel always offers Continue here, using the actual target, plus a retry after the wait interval and app-menu instructions. No timeout automatically selects another destination.

A page becoming hidden is recorded as an observation. It is not confirmation that a browser opened or a destination loaded. Returning shows assistance without relaunching. One tap launches at most one scheme; modified clicks and new-tab gestures retain normal browser behavior.

Use `mode: direct` as the immediate disable switch if app behavior changes. Test using the [real-device checklist](testing.md#real-device-checklist) before describing a strategy as supported in production.
