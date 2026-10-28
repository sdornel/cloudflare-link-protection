# Security and browser verification

This is a static public page. It has no database, login, upload endpoint, or application server. Supplied headers restrict scripts, framing, MIME sniffing, and browser capabilities. HTTPS links are direct and visitors receive the same HTML regardless of user-agent, referrer, or IP.

Cloudflare protection is configured on the proxied custom domain; it is not active when opening the file locally. Review security events after enabling a rule.

| Control | Suggested baseline |
| --- | --- |
| DDoS protection | Automatic |
| Free Managed Ruleset | Keep enabled; deployed by default on Free |
| Browser Integrity Check | Keep its default initially; investigate false positives |
| Bot Fight Mode | Off initially for a public page used in embedded browsers |
| Custom Managed Challenge | Use for observed abusive requests |
| Blanket challenge / Under Attack Mode | Off during normal traffic |

The Free Managed Ruleset is a subset of paid rules. Free plans currently support five custom rules including Managed Challenge; regex and the Log action are not available on Free. [WAF setup](https://developers.cloudflare.com/waf/get-started/), [custom-rule availability](https://developers.cloudflare.com/waf/custom-rules/).

## Targeted Managed Challenge

Review **Security → Analytics → Events** for abuse. Then open **Security → Security rules → Create rule → Custom rules** (older dashboards: **Security → WAF → Custom rules**).

Replace the hostname and documentation-only IP below with your own hostname and a source confirmed to be abusive:

```text
(http.host eq "links.example.com"
 and ip.src in {192.0.2.123}
 and http.request.uri.path in {"/" "/index.html" "/example" "/example/" "/example/index.html" "/example/more-soon" "/example/more-soon/" "/example/more-soon/index.html" "/sample-creator" "/sample-creator/" "/sample-creator/index.html"}
 and http.request.method in {"GET" "HEAD"})
```

Choose **Managed Challenge**, deploy, and inspect matching events. This is manual targeting, not automatic bot scoring. Shared or reassigned IP addresses can cause false positives; remove temporary rules when no longer useful. [Creating rules](https://developers.cloudflare.com/waf/custom-rules/create-dashboard/).

Replace `/sample-creator` with the actual configured profile path, keeping its slash and index variants. A rule matching only `/` does not cover a nested creator page. This example targets document routes so that images, stylesheets, and modules can load normally. It does not challenge the entire site or activate automatically for all suspected bots.

Do not use old threat-score recipes: `cf.threat_score` now always returns zero. [Threat score](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.threat_score/). Enterprise Bot Management scores are not part of the free configuration. [Feature interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).

## Stronger checks and temporary site-wide protection

Find **Browser integrity check** in **Security → Settings**. It checks suspicious HTTP headers and is normally enabled. It is not proof that a client is human. [Browser Integrity Check](https://developers.cloudflare.com/waf/tools/browser-integrity-check/).

Free **Bot Fight Mode** can challenge automated traffic but cannot be exempted with a custom-rule Skip action. Test it carefully before enabling it on a public page. [Interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).

For temporary broader protection, create a custom rule with this expression and action **Managed Challenge**:

```text
(http.host eq "links.example.com"
 and not starts_with(http.request.uri.path, "/cdn-cgi/"))
```

This affects the whole hostname, including assets, except Cloudflare's reserved service path. Disable it when no longer needed. During an actual layer-7 DDoS attack, **Security → Settings → Under Attack Mode / Security level** is another option that presents challenges and may affect other sites in the zone. [Under Attack Mode](https://developers.cloudflare.com/waf/tools/security-level/).

Blanket challenges can interrupt embedded browsers and prevent crawlers or reviewers from accessing the page. Keep ordinary public-page access low-friction; use rules to handle actual abuse. [Browser limitations](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/).

## Public content and private inputs

The page uses no crawler blocklist, content switching, delayed destination reveal, or automatic outbound CTA redirects. Opt-in native entry handoff can attempt the same landing page in an external browser; actual content and destinations remain unchanged. `robots.txt` allows all agents. Demo `noindex` is an indexing preference, not access control.

Private build inputs keep deployment-specific data out of source control. They do not make the resulting website secret. Do not put API credentials in site configuration. Review both the page and its destinations against the rules of any platform where you share them; security challenges are not a compliance guarantee.

For repository publication and history checks, see [configuration](configuration.md#before-publishing-the-repository).

## Native schemes and optional analytics

Configured external destinations remain HTTPS anchors; the built-in local More soon link navigates directly. Only the trusted strategy builder constructs custom launch schemes after URL validation. Incoming query parameters never select arbitrary automatic destinations. The `_lp_handoff` marker only prevents repeated attempts and grants no access.

Runtime JSON includes an explicit public allowlist and escapes HTML-sensitive characters. Client modules remain external; GA4 origins are added to CSP only when configured. No `unsafe-inline` or `unsafe-eval` permission is added. A different browser has separate storage and may require challenge clearance again. A handoff cannot rescue a page whose challenge prevented the application from loading.
