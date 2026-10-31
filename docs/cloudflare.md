# Cloudflare Workers from a public GitHub repository

Use Workers Static Assets for new deployments. Cloudflare now recommends Workers for new projects; Pages remains available for existing deployments with branded verification disabled. The repository's `wrangler.jsonc` runs the shared Worker before serving `dist/` through its `ASSETS` binding. Runtime keys are needed only for the optional Turnstile gate. [Cloudflare's recommendation](https://developers.cloudflare.com/pages/) and [Static Assets](https://developers.cloudflare.com/workers/static-assets/).

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

Leave runtime variables and secrets empty for the demo; Wrangler creates the `ASSETS` binding. With no `SITE_CONFIG_JSON` and no ignored local config in the Git checkout, `npm run build` selects the public sample on production and preview branches. The optional `build:example` command remains available to force the sample during local checks. If you choose a different Worker name, update the config's name or pass `--name your-worker-name` to Wrangler.

Commit and push reviewed application files, including `wrangler.jsonc` and the package lock, before deploying. Git integration builds the GitHub commit, not files saved only on your computer. Keep real config and generated directories ignored. After a successful deployment, open the assigned HTTPS `workers.dev` URL; the landing links to the demo at `/example/`. No custom domain is needed for the demo.

## Customized Worker with private inputs

Use the existing Worker to host the platform landing, neutral demo, and configured profile path, or create a separate Worker for an independently deployed site. Multiple domains on a Worker are aliases for the same output. Production inputs belong under **Settings → Builds → Variables and secrets**, not the separate runtime-variable section.

1. Disable non-production branch builds for this Worker before adding private inputs. Use the neutral Worker for pull-request previews. A branch guard cannot protect a secret from untrusted build code that can read the environment. [Branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).
2. Add the full JSON as an encrypted **build secret** named `SITE_CONFIG_JSON`, without shell quotes or a `SITE_CONFIG_JSON=` prefix. Never print it.
3. Keep the build command as `npm run build`. It already reads the secret and writes `dist/`; no separate private command is needed to use private input.
4. Keep the deploy command as `npx wrangler deploy` when using the Worker named in `wrangler.jsonc`. For a differently named Worker, use `npx wrangler deploy --name your-site-worker`. This publishes the landing, demo, and profile together from `dist/`.
5. If the production branch is not `main`, set `SITE_PRODUCTION_BRANCH`. The builder validates `WORKERS_CI_BRANCH` during Workers builds and rejects customized builds on other branches. A normal build without environment or local config selects the sample; confirm the build log says `using SITE_CONFIG_JSON` for a configured deployment. Malformed supplied config fails instead of falling back.
6. Redeploy after configuration changes. Runtime secrets cannot change already-generated HTML. Once real destinations are configured and placeholders disabled, `npm run build:production` adds production validation while retaining `dist/` and the same deploy command.

The optional `npm run build:private` requires private input and writes `dist-private/`; pair it with `npx wrangler deploy --assets ./dist-private --name your-site-worker`. Its production variant is `npm run build:private:production`. These commands remain available when a missing private input should fail the build, but are not prerequisites for using private configuration.

Ignored local images are unavailable to Git-backed builds. Use HTTPS image URLs, initials, or build locally using `.private/assets/` and deploy the generated output directory (`dist/` for a normal build).

Encrypted input stays outside Git, but the rendered profile is public. GitHub deployment checks may expose its URL. If this association matters, build locally from the same repository and deploy the output without Git integration. Only trusted code should run with production build secrets.

### Sync private configuration without dashboard copying

The local `npm run config:sync` command sends `config/site.json` directly to Cloudflare as the encrypted `SITE_CONFIG_JSON` build secret. Your GitHub integration keeps building application code from the repository. The command explicitly reads the local file, ignoring any `SITE_CONFIG_JSON` environment override. It does not copy the config into Git, change runtime Turnstile keys, or upload local code.

Set up access once on each publishing computer:

1. Create a **user API token** at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with **Account → Workers Builds Configuration → Edit** and **Account → Workers Scripts → Read**, scoped to the account hosting the Worker. The API calls the first permission `Workers CI Write`; this is separate from your existing build/deployment token. Account-owned tokens are not supported by the Builds API. See [Cloudflare's API prerequisites](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/#create-an-api-token).
2. Find your **Account ID** in Cloudflare; use the account identifier, not the domain's Zone ID.
3. Create or edit **`.env.cloudflare` at the repository root**. This file is ignored. Put the following values in it, replacing the placeholders locally:

   ```dotenv
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_API_TOKEN=your_user_api_token
   CLOUDFLARE_WORKER_NAME=cloudflare-link-protection
   ```

4. Keep the Worker connected to GitHub with production branch `main`, build command `npm run build`, and deploy command `npx wrangler deploy`. As with manual secret setup, keep private inputs restricted to trusted production builds. The sync command selects only a GitHub trigger whose branch inclusion list is exactly the production branch and whose exclusion list is empty; it refuses wildcard or ambiguous targets. It does not alter your branch settings.

First validate without contacting Cloudflare:

```sh
npm run config:sync -- --dry-run
```

For a **configuration-only change**, edit `config/site.json`, then run:

```sh
npm run config:sync -- --deploy
```

This validates a temporary build, updates the secret, verifies that Cloudflare marks it secret, and requests a production-branch build. Check **Builds** for completion: an accepted request is not a confirmed deployment. It builds the latest code already on GitHub; uncommitted or unpushed application changes are not included.

For **code and configuration changes together**, sync before pushing reviewed commits:

```sh
npm run config:sync
git push
```

Run the push only after sync succeeds. GitHub's existing integration then starts the build. Avoid also using `--deploy` for the same push unless you intend a second build. Sync alone updates the saved configuration but does not rebuild the live site. Nothing runs automatically on file saves or ordinary pushes; the command automates the transfer explicitly. Do not put this command in Cloudflare's build/deploy settings or public CI. No Git hooks are installed.

The script discovers the Worker tag and production trigger from the configured name. If several otherwise eligible triggers exist, set optional `CLOUDFLARE_BUILD_TRIGGER_ID` in `.env.cloudflare` to the intended trigger UUID; it must still pass branch and Worker checks. For a production branch other than `main`, set `SITE_PRODUCTION_BRANCH` both in this local file and as a readable build variable on that trigger. Existing process environment values override `.env.cloudflare`. The script does not read `.env` or `.dev.vars`, which may contain unrelated runtime credentials.

Only `SITE_CONFIG_JSON` is patched, using `is_secret: true`; unrelated variables remain unchanged. The token and configuration travel in the HTTPS request, never command-line arguments or logs. API responses/errors are not printed because build metadata can contain sensitive values. Requests reject redirects, time out after 15 seconds, and are not retried automatically. If the secret updates but verification or the build request fails, the command says so; inspect Builds before retrying because a timed-out write may have applied. [Build-variable update contract](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/subresources/environment_variables/methods/upsert/), [trigger discovery](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/list/), and [starting a build](https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/create_build/).

The compact config must fit the API's **5,000-character** variable limit. Local `/images/` references are rejected: GitHub cannot retrieve ignored files, so use publicly readable HTTPS images or initials. Secrets cannot be downloaded to restore a lost local config. Keep a private backup when moving between computers; syncing from an older copy replaces the remote config. The rendered page and destinations remain public. Multi-profile storage/editor support remains a separate roadmap item.

### Landing, demo, and profile on the same Worker

Set `"profilePath": "/sample-creator"` in the complete private config and keep `siteUrl` as the HTTPS origin, for example `https://example.com`. The build emits the platform landing at `/`, the neutral demo at `/example/`, and `/sample-creator/index.html` with its own assets. Optional `landing` settings in the private config customize only the homepage. Deploy all of `dist/` (or `dist-private/` if using the optional private command); do not point Wrangler at the profile subfolder. This needs no extra custom domain or DNS entry. Omitted `profilePath` (or `/`) keeps the configured page at the root.

Push the generic path-support code before deploying, then paste the updated **complete** config into the build secret and trigger a new production build. Confirm `/` shows the landing, its example button opens `/example/`, `/sample-creator` opens the configured page, and `/missing` returns 404. Keep the real config and slug out of GitHub. One configured creator alongside the landing and demo is supported per build.

Workers' default HTML handling redirects a directory page from `/sample-creator` to `/sample-creator/`. Both forms are valid entry URLs and generated asset URLs work from either. [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

## Custom domain and HTTPS

For an optional verification page with your own branding, follow [Turnstile setup](verification.md). That feature uses **runtime** secrets as well as build-time profile settings. The existing commands remain unchanged. A broad Managed Challenge rule must be adjusted so the branded verification page and its submission can load first.

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

For a manual demo deployment, authenticate with `npx wrangler login`, build the sample, then run `npx wrangler deploy`. For a configured site, `npm run build` reads the ignored local config or environment input; deploy with `npx wrangler deploy`, adding `--name your-site-worker` if needed. Pair the optional private command with its explicit `--assets ./dist-private` override as described above. Authentication state stays outside the repository; `.wrangler/` is ignored. Deploying publishes the rendered content.

Use the Worker's deployment history to roll back to a successful version. [Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/). Assets-only requests have different allowances from requests invoking a Worker. The current configuration invokes the Worker before assets, including when verification is disabled; account [Workers quotas](https://developers.cloudflare.com/workers/platform/limits/) apply. Builds have separate [quotas](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

For staging, use another Worker with synthetic inputs, its own hostname and analytics identifier, and an explicit production branch if needed. Browser handoff can change cookies or challenge clearance; it does not bypass Cloudflare.

## Existing Pages deployments

The static output remains compatible with Pages. Existing projects can retain `npm run build:example` with output `dist`, or a strict private build with output `dist-private`. The branch guard still recognizes `CF_PAGES_BRANCH`. Follow [Pages configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) for that platform's settings; new deployments should use the Workers workflow above.

## Completing the first hosted-demo release

The [neutral demo](https://cloudflare-link-protection.skdornel.workers.dev/) is live. Commit `e109edc` deployed successfully on 2026-10-27. The updated Worker setup guide, HTTPS, security headers, direct links, and custom 404 page were checked with JavaScript enabled and disabled. GitHub Actions passed all five jobs; see the [verification record](implementation-status.md).

After future deployments, recheck the landing-to-example link, profile links, and custom 404 page. The publishing panel has been removed from the current example UI; setup instructions remain in this document. Record results in the status guide. Test any custom-domain challenge separately from `workers.dev`. Keep physical iOS/Android Instagram checks pending until real-device evidence exists.
