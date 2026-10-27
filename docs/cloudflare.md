# Cloudflare Pages from a public GitHub repository

The public repository contains the reusable engine and a neutral demo. It can support two separate Pages projects: one public demo and one customized site with private build inputs.

The root `example.html` is a standalone reference for opening locally; it does not read config and is not copied into build output. Pages serves the generated `index.html`. The normal `npm run build` selects `SITE_CONFIG_JSON`, then local `config/site.json`, then `config/site.example.json`. Because the local file is ignored, a Git-backed build uses the sample unless you supply the environment variable. Upload/deploy only the chosen output directory.

## Public demo project

The neutral demo and standalone `example.html` include a collapsible **Publish with Cloudflare** checklist beneath the footer. It contains these first-deployment settings and works without JavaScript. Configured builds omit the setup guide.

In **Workers & Pages → Create application → Pages → Connect to Git**, select the repository. Grant the Cloudflare Workers & Pages GitHub app access to the selected repository if necessary. [GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).

| Setting | Value |
| --- | --- |
| Framework | None |
| Production branch | `main` |
| Build command | `npm run build:example` |
| Output directory | `dist` |
| Node | 22 or newer; optionally set `NODE_VERSION=22` |
| Dependency installation | Set `SKIP_DEPENDENCY_INSTALL=1` |

The production build needs no installed packages. Skipping automatic installation avoids downloading development-only browser tooling. Cloudflare documents this [build variable](https://developers.cloudflare.com/pages/configuration/build-image/#skip-dependency-install).

For a first demo without a custom domain, choose an available neutral project name such as `static-profile-demo`. Leave the root directory empty (repository root), set `NODE_VERSION=22` and `SKIP_DEPENDENCY_INSTALL=1` in the build environment, then deploy. Pages assigns a `pages.dev` address, and you can add a custom domain later. The chosen name must be available; no specific hostname is reserved by this repository.

Git integration builds the selected branch on GitHub, not uncommitted files on your computer. Commit and push the reviewed public application files to include the newest features. Keep `config/site.json`, generated output, and `.private/` ignored. If another contributor is still editing the specification, coordinate that file separately from application changes.

Do not add `SITE_CONFIG_JSON` to this project's environments. The explicit example build ignores it if accidentally present and always uses `config/site.example.json`. Preview builds can use the same command.

## Customized project with private inputs

Create a second Pages project connected to the same repository.

The normal `npm run build` also supports customized deployment to `dist/` using `SITE_CONFIG_JSON`. The strict commands below keep the existing `dist-private/` output and fail if the input is missing, so they are useful for a project that must always publish its customized page. Both modes restrict customized Cloudflare builds to the configured production branch.

Before its first customized deployment:

1. Open **Settings → Variables and Secrets** (some dashboards label it **Environment variables**). Select **Production**.
2. Add **`SITE_CONFIG_JSON`**. Paste the full JSON from your ignored `config/site.json` file as the value, without shell quotes or a `SITE_CONFIG_JSON=` prefix. Choose **Encrypt**. This must be available to the build, not just to runtime Functions. Never print it in a build command. See [build variables](https://developers.cloudflare.com/pages/configuration/build-configuration/) and [encrypted variables](https://developers.cloudflare.com/pages/functions/bindings/#secrets).
3. Set the production build command to **`npm run build:private`** while reviewing placeholders; use **`npm run build:private:production`** when the domain and links are ready. Set the output directory to **`dist-private`**.
4. Leave `SITE_CONFIG_JSON` unset for **Preview**. Under **Builds / Builds & deployments → Branch control**, set preview deployments to **None**. [Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).
5. If production uses a branch other than `main`, set **`SITE_PRODUCTION_BRANCH`** to that name. The builder checks `CF_PAGES_BRANCH` and refuses private builds from another branch. [Cloudflare build metadata](https://developers.cloudflare.com/pages/configuration/build-configuration/).
6. Deploy. If private input is missing or invalid, the build fails without printing it; it never substitutes the public demo. After changing a variable, redeploy for it to affect the generated page.

For images in a Git-backed build, use HTTPS image URLs in private config. Ignored local images are not on Cloudflare. A local `npm run build:private` can use `.private/assets/`, followed by manually uploading `dist-private/`.

**Scope of privacy:** encrypted config stays out of the repository, but rendered display data is public on the deployed website. A public repository's Cloudflare checks may reveal the deployment URL. If exposing the deployment URL through public GitHub checks is unacceptable, build locally from the same repository and upload only its output; a second repository is not required. Only merge trusted build changes: code running in the production build can access its build variables.

## Custom domain and HTTPS

Register a domain you control; registration/renewal is separate from free hosting. Add it to Cloudflare and review DNS records before changing nameservers, especially existing mail records. For zone-level security controls, keep the hostname proxied.

In **Pages project → Custom domains → Set up a domain**, add your apex or subdomain. Complete this association before manually adding a CNAME. Apex domains require a Cloudflare zone in the same account. Wait for DNS and certificate activation, then verify HTTPS. [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Set the config's `siteUrl` to the final HTTPS origin. Replace example links, set `placeholderLinks: false`, and run the production build. Canonical metadata and a sitemap will be generated. Check [certificate/CAA troubleshooting](https://developers.cloudflare.com/pages/configuration/custom-domains/#known-issues) if HTTPS activation fails.

The `pages.dev` deployment remains a second public endpoint. WAF rules on your custom zone do not protect that endpoint. Both serve the same page content; this is a public profile, not a protected file store.

## Verification and manual uploads

Test HTTPS, links, mobile and embedded browsers, a missing URL returning 404, and security headers. Pages applies `_headers` to static responses. The local preview server does not emulate Cloudflare headers, analytics injection, or challenges. [Headers](https://developers.cloudflare.com/pages/configuration/headers/).

If using dashboard Direct Upload instead, upload only the contents of `dist/` or `dist-private/`, with `index.html` at the upload root. A Direct Upload project cannot later be converted to Git integration. [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Use the prior successful production deployment to roll back if needed. [Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/). Nothing here requires a paid Cloudflare plan; check [current Pages limits](https://developers.cloudflare.com/pages/platform/limits/) for your usage.

## Staging and browser handoff

Use a separate Pages project for an optional staging site, with its own hostname, synthetic config, and analytics identifier. If its deployment branch is not `main`, set `SITE_PRODUCTION_BRANCH` for that project. Do not expose production variables to pull requests.

An external browser can have different cookies and challenge clearance from the embedded browser. Expect another challenge or acknowledgment when switching; native handoff does not bypass Cloudflare. Keep ordinary access low-friction and test all optional controls on real devices. New client modules use content-hashed asset directories; `_headers` is applied only on Pages, not by the local preview server.
