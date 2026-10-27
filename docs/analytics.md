# Free Cloudflare Web Analytics

Analytics is optional and off in the example configuration. Links work without its script. Choose one installation method to avoid duplicate beacons.

## Dashboard integration

Leave `analytics.cloudflareToken` empty. Go to **Workers & Pages → project → Metrics → Web Analytics → Enable**, then deploy again. Cloudflare injects the beacon on the next deployment. View the site under the account's **Web Analytics** page. [Pages analytics](https://developers.cloudflare.com/pages/how-to/web-analytics/).

## Configuration token

Alternatively, add the final hostname to Web Analytics and choose manual installation. Put the supplied site token in `analytics.cloudflareToken` in your selected config. Disable automatic injection for that same site, rebuild, and deploy. This is a public site token, not an account API credential.

The generated CSP permits `static.cloudflareinsights.com`, the manual collection host `cloudflareinsights.com`, and same-origin collection used by automatic injection. See [setup and CSP guidance](https://developers.cloudflare.com/web-analytics/faq/).

## Verify and interpret

Visit the deployed hostname, wait for it to load, then navigate away. In Network tools, check for one beacon script and successful collection requests. If metrics are missing, inspect CSP errors, blocked scripts, a hostname/token mismatch, or WAF challenges. Localhost is not the registered analytics hostname.

Web Analytics provides traffic and performance information. It currently does not support custom events or UTM-query reporting, so this integration does not count button clicks or purchases. Browser restrictions and blockers can reduce counts or suppress referrers. [Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/).

No additional analytics service or tracker has been added. Reassess privacy requirements if you add other trackers or collect personal data later.
