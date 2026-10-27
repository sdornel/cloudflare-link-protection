// Static, neutral instructions shared by the served demo and offline example.
// Only sample builds opt in; configured pages never include this guide.
export function setupGuide() {
  return `<details id="publish-guide" class="setup-guide">
        <summary>Publish with Cloudflare</summary>
        <div class="setup-content">
          <p class="hint">Publish this demo with <strong>Cloudflare Workers Static Assets</strong>. A Cloudflare account and GitHub repository are enough. No custom domain is needed.</p>
          <ol class="setup-steps">
            <li>
              <h2>Push the public application to GitHub</h2>
              <p>Commit and push the reviewed application files to <code>main</code>. Cloudflare builds what is on GitHub, so changes saved only on your computer will not appear.</p>
              <p>Keep <code>config/site.json</code>, <code>.private/</code>, <code>dist/</code>, and <code>dist-private/</code> Git-ignored. The committed <code>config/site.example.json</code> provides the neutral demo.</p>
            </li>
            <li>
              <h2>Create a Cloudflare Worker</h2>
              <p>Open the <a href="https://dash.cloudflare.com/">Cloudflare dashboard</a>. Go to <strong>Workers &amp; Pages → Create application</strong>, then choose the <strong>Worker</strong> workflow and connect Git. If you already created a Worker, open it to configure its build settings.</p>
              <p>Connect GitHub and select your <code>cloudflare-link-protection</code> repository (or your fork). If it is missing, grant the Cloudflare GitHub app access to that repository.</p>
            </li>
            <li>
              <h2>Use these build settings</h2>
              <dl class="setup-settings">
                <dt>Worker name</dt><dd><code>cloudflare-link-protection</code> (matches <code>wrangler.jsonc</code>)</dd>
                <dt>Production branch</dt><dd><code>main</code></dd>
                <dt>Build command</dt><dd><code>npm run build</code></dd>
                <dt>Deploy command</dt><dd><code>npx wrangler deploy</code></dd>
                <dt>Root directory</dt><dd><code>/</code> (repository root)</dd>
              </dl>
              <p>Leave build variables and secrets empty. Keep automatic dependency installation enabled for Wrangler. The committed <code>wrangler.jsonc</code> selects <code>dist</code> as the static asset directory. With no private configuration, the build uses the public sample. No runtime variables or bindings are needed.</p>
            </li>
            <li>
              <h2>Deploy and check the result</h2>
              <p>Deploy the latest commit. Once the build succeeds, open the HTTPS <code>workers.dev</code> address Cloudflare provides and bookmark it. The address is assigned during deployment.</p>
              <ul>
                <li>Confirm the neutral profile and three sample buttons appear.</li>
                <li>Check a button opens its <code>example.com</code> placeholder destination.</li>
                <li>Check the layout on your phone and a made-up path returns the 404 page.</li>
              </ul>
              <p>Future pushes to <code>main</code> trigger new deployments. This checklist does not deploy anything by itself.</p>
            </li>
          </ol>
          <details class="setup-help">
            <summary>If something goes wrong</summary>
            <ul>
              <li><strong>Old page:</strong> check the latest application changes were pushed to GitHub and the deployment used that commit.</li>
              <li><strong>Configuration error:</strong> check the build command is exactly <code>npm run build</code> and the demo's build variables and secrets are empty.</li>
              <li><strong>Missing output:</strong> check the build command and that <code>wrangler.jsonc</code> was committed at the repository root.</li>
              <li><strong>Repository missing:</strong> update the Cloudflare GitHub app's repository access.</li>
              <li><strong>Worker name mismatch:</strong> use the same name in Cloudflare and <code>wrangler.jsonc</code>, or add <code>--name your-worker-name</code> to the deploy command.</li>
            </ul>
          </details>
          <h2>Later: analytics and your own domain</h2>
          <p>For optional Web Analytics, follow <code>docs/analytics.md</code>. For your own domain, first activate its zone in Cloudflare, then open the Worker's <strong>Settings → Domains &amp; Routes → Add → Custom Domain</strong>. Wait for DNS and HTTPS activation.</p>
          <p>Custom-zone WAF and Managed Challenge rules require a domain you control; they do not cover the Worker's <code>workers.dev</code> address. Test challenges in mobile in-app browsers before making them stricter.</p>
          <p>For a separately configured live site, follow <code>docs/cloudflare.md</code> and <code>docs/security.md</code> in the repository.</p>
          <p class="hint">Official references: <a href="https://developers.cloudflare.com/workers/ci-cd/builds/">Git deployment</a>, <a href="https://developers.cloudflare.com/workers/ci-cd/builds/configuration/">build settings</a>, <a href="https://developers.cloudflare.com/workers/static-assets/">static assets</a>, and <a href="https://developers.cloudflare.com/workers/configuration/routing/custom-domains/">custom domains</a>.</p>
        </div>
      </details>`;
}
