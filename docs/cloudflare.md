# Cloudflare Workers from a public GitHub repository

Use Workers Static Assets for new deployments. Cloudflare now recommends Workers for new projects; Pages remains available for existing deployments. The repository's `wrangler.jsonc` serves `dist/` without a Worker script, runtime secrets, or bindings. [Cloudflare's recommendation](https://developers.cloudflare.com/pages/) and [Static Assets](https://developers.cloudflare.com/workers/static-assets/).

Use separate Workers for independently deployed sites, or publish the platform landing, neutral demo, and configured profile path on one Worker. The root `example.html` is an offline reference; deployment serves generated HTML. The normal build selects `SITE_CONFIG_JSON`, then ignored `config/site.json`, then the neutral sample. Deploy the entire chosen output directory.

## Public demo project

Keep an existing Worker connected to this repository. For a new one, open **Workers & Pages**, create a Worker, and connect GitHub. Grant the Cloudflare GitHub app access to the repository if necessary. [Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

In the Worker's **Settings → Builds**, use:

| Setting | Value |
| --- | --- |
| Worker name | `cloudflare-link-protection`, matching `wrangler.jsonc` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` (repository root) |
| Build variables and secrets | Leave empty |

Keep automatic dependency installation enabled: the generator needs only Node, but deployment uses the pinned Wrangler development dependency. Do not set `SKIP_DEPENDENCY_INSTALL`. `assets.directory` in `wrangler.jsonc` selects `dist`; there is no Pages-style output-directory setting to fill in. [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Cloudflare's default build image provides a supported Node version; no version override is needed. [Build image defaults](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Leave runtime variables, secrets, and bindings empty too. With no `SITE_CONFIG_JSON` and no ignored local config in the Git checkout, `npm run build` selects the public sample on production and preview branches. The optional `build:example` command remains available to force the sample during local checks. If you choose a different Worker name, update the config's name or pass `--name your-worker-name` to Wrangler.

Commit and push reviewed application files, including `wrangler.jsonc` and the package lock, before deploying. Git integration builds the GitHub commit, not files saved only on your computer. Keep real config and generated directories ignored. After a successful deployment, open the assigned HTTPS `workers.dev` URL; the landing links to the demo at `/example/`. No custom domain is needed for the demo.

## Customized Worker with private inputs

Use the existing Worker to host the platform landing, neutral demo, and configured profile path, or create a separate Worker for an independently deployed site. Multiple domains on a Worker are aliases for the same output. Production inputs belong under **Settings → Builds → Variables and secrets**, not the separate runtime-variable section.

1. Add the full JSON as an encrypted **build secret** named `SITE_CONFIG_JSON`, without shell quotes or a `SITE_CONFIG_JSON=` prefix. Never print it.
2. Set the build command to `npm run build:private` while reviewing placeholders, then `npm run build:private:production` once the domain and destinations are ready.
3. Set the deploy command to `npx wrangler deploy --assets ./dist-private --name your-site-worker`. Replace the example name with that Worker's exact name. When reusing the existing Worker, use its existing name; this updates the landing, demo, and profile together.
4. Disable non-production branch builds for this Worker before adding private inputs. Use the neutral Worker for pull-request previews. A branch guard cannot protect a secret from untrusted build code that can read the environment. [Branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).
5. If the production branch is not `main`, set `SITE_PRODUCTION_BRANCH`. The builder validates `WORKERS_CI_BRANCH` during Workers builds and rejects customized builds on other branches. Missing private input fails the strict build without falling back to the demo.
6. Redeploy after configuration changes. Runtime secrets cannot change already-generated HTML.

Ignored local images are unavailable to Git-backed builds. Use HTTPS image URLs, initials, or build locally using `.private/assets/` and deploy the resulting `dist-private/` directory.

Encrypted input stays outside Git, but the rendered profile is public. GitHub deployment checks may expose its URL. If this association matters, build locally from the same repository and deploy the output without Git integration. Only trusted code should run with production build secrets.

### Landing, demo, and profile on the same Worker

Set `"profilePath": "/sample-creator"` in the complete private config and keep `siteUrl` as the HTTPS origin, for example `https://example.com`. The build emits the platform landing at `/`, the neutral demo at `/example/`, and `/sample-creator/index.html` with its own assets. Optional `landing` settings in the private config customize only the homepage. Deploy all of `dist-private`; do not point Wrangler at the profile subfolder. This needs no extra custom domain or DNS entry. Omitted `profilePath` (or `/`) keeps the configured page at the root.

Push the generic path-support code before deploying, then paste the updated **complete** config into the build secret and trigger a new production build. Confirm `/` shows the landing, its example button opens `/example/`, `/sample-creator` opens the configured page, and `/missing` returns 404. Keep the real config and slug out of GitHub. One configured creator alongside the landing and demo is supported per build.

Workers' default HTML handling redirects a directory page from `/sample-creator` to `/sample-creator/`. Both forms are valid entry URLs and generated asset URLs work from either. [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

## Custom domain and HTTPS

Workers Custom Domains require an active Cloudflare zone for both apex domains and subdomains. Review existing DNS and mail records before changing nameservers. In the Worker, open **Settings → Domains & Routes → Add → Custom Domain**. Cloudflare creates the DNS record and manages the certificate. Resolve any existing conflicting hostname record and verify HTTPS before enabling production metadata. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Set `siteUrl` to the final HTTPS origin, replace placeholders, and set `placeholderLinks: false`. The production build generates canonical metadata and a sitemap. Domain registration/renewal is separate from hosting. See [certificate troubleshooting](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/troubleshooting/) if activation fails.

The `workers.dev` address is a separate public endpoint. Custom-zone WAF rules do not apply there. Test domain challenges separately; ordinary visitors must still receive the same page and destinations. See [security](security.md).

## Local verification, deployment, and rollback

```sh
npm ci
npm run check:workers
npx wrangler dev --local
```

`check:workers` builds the neutral sample and runs a deployment dry run without publishing. Wrangler's local server applies Cloudflare static routing and `_headers`; the simpler `npm run preview` server supports profile directory indexes, slash normalization, and real 404s, but does not emulate edge headers or challenges. The config uses `not_found_handling: "404-page"` for real missing-page responses. [Static routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) and [headers](https://developers.cloudflare.com/workers/static-assets/headers/).

For a manual demo deployment, authenticate with `npx wrangler login`, build the sample, then run `npx wrangler deploy`. For a configured site, build privately and use the explicit `--assets ./dist-private --name your-site-worker` command above. Authentication state stays outside the repository; `.wrangler/` is ignored. Deploying publishes the rendered content.

Use the Worker's deployment history to roll back to a successful version. [Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/). Static asset requests are free and unlimited; builds have separate quotas. Review [asset limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) and [build limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) as usage grows.

For staging, use another Worker with synthetic inputs, its own hostname and analytics identifier, and an explicit production branch if needed. Browser handoff can change cookies or challenge clearance; it does not bypass Cloudflare.

## Existing Pages deployments

The static output remains compatible with Pages. Existing projects can retain `npm run build:example` with output `dist`, or a strict private build with output `dist-private`. The branch guard still recognizes `CF_PAGES_BRANCH`. Follow [Pages configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) for that platform's settings; new deployments should use the Workers workflow above.

## Completing the first hosted-demo release

The [neutral demo](https://cloudflare-link-protection.skdornel.workers.dev/) is live. Commit `e109edc` deployed successfully on 2026-10-27. The updated Worker setup guide, HTTPS, security headers, direct links, and custom 404 page were checked with JavaScript enabled and disabled. GitHub Actions passed all five jobs; see the [verification record](implementation-status.md).

After future deployments, recheck the landing-to-example link, profile links, and custom 404 page. The publishing panel has been removed from the current example UI; setup instructions remain in this document. Record results in the status guide. Test any custom-domain challenge separately from `workers.dev`. Keep physical iOS/Android Instagram checks pending until real-device evidence exists.
