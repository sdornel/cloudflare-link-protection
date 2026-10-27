# Optional analytics

Links, browser strategies, and the landing page work without any external analytics service. The neutral sample has empty provider identifiers. Never put account API keys or secrets in site configuration; browser measurement identifiers are public.

## Cloudflare visits and performance

For Workers, create a Web Analytics site and place its public 32-character beacon token in `analytics.cloudflareToken`, then rebuild. Use either the generated manual beacon or Cloudflare's automatic injection on an eligible zone, never both. Leave the token empty if using automatic injection. Existing Pages deployments can still use their dashboard integration. See [Web Analytics setup](https://developers.cloudflare.com/web-analytics/get-started/) and the [FAQ](https://developers.cloudflare.com/web-analytics/faq/).

Cloudflare Web Analytics does not currently support custom events or UTM-query reporting. It supplies visit/performance information, not CTA clicks, handoff success, or purchases. The build preserves CSP allowances for its beacon and collection endpoints.

## Local events and GA4

Enhanced builds emit `profile:analytics` events on `window`. With no collector enabled, these are transient local events and are not stored remotely. Set `analytics.debug: true` to inspect the same sanitized payloads in developer tools.

```js
window.addEventListener('profile:analytics', ({ detail }) => {
  console.log(detail); // for local development only
});
```

| Event | Meaning |
| --- | --- |
| `landing_view` | First visible client initialization |
| `outbound_click` | Configured CTA activation |
| `browser_strategy` | Selected direct/native strategy |
| `handoff_attempt` | A scheme navigation was attempted |
| `handoff_deferred` | Automatic opening needs a user gesture |
| `handoff_page_hidden` | Page became hidden; not proof of success |
| `handoff_unconfirmed` | Assistance timeout elapsed |
| `handoff_returned` | Visitor returned after an observed departure |
| `fallback_shown`, `fallback_click` | Help displayed or direct alternative activated |
| `age_acknowledged` | Optional self-attestation action |

Payloads permit only a stable link ID, strategy, platform category, trigger, and bounded reason. They omit raw destination URLs, query parameters, fragments, user-agent strings, and arbitrary config. A client-module failure prevents local events while leaving HTML links functional.

Set `analytics.ga4MeasurementId` to a valid `G-…` value for GA4 reporting. `landing_view` maps to one manual `page_view`; other names become custom events. The adapter overrides page location/referrer to omit queries/fragments, uses a generic page title, disables advertising features, bounds its pending queue, and never waits for delivery before navigating. Register event parameters as custom dimensions in GA4 if you need them in reports. See [GA4 events](https://developers.google.com/analytics/devguides/collection/ga4/events) and [manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views).

**Disable enhanced measurement for the web stream**, especially automatic outbound clicks, site search, and browser-history page changes. Otherwise the provider can emit duplicate or more detailed events outside this adapter's allowlist. This application does not configure your GA property for you.

## Consent and failure behavior

The default `ga4Consent: required` displays small inline allow/decline controls and loads no Google script before permission. Pre-consent clicks are not replayed later. Choosing Allow reports the current view only, at most once for this document even after Allow → Decline → Allow or while the provider is still loading. Choosing Keep analytics off disables future adapter events; previously created provider cookies are not retroactively erased. The choice is in-memory and the control remains available on the page.

`ga4Consent: granted` is an explicit deployment policy choice. It does not determine whether that policy meets requirements for your audience. Ads storage, personalization, and ads user-data consent remain denied; the integration enables no advertising features. Cloudflare collection is configured independently of this GA4 choice.

Provider failures, blockers, offline visits, and rapid app changes lose events. Neither a timer, page-hide observation, nor a returned visitor proves the external browser loaded the destination. There is intentionally no `handoff_success` event. Verify reports with test traffic without publishing production configuration in debug logs or screenshots.
