// Static, neutral instructions shared by the served demo and offline example.
// Only sample builds opt in; configured pages never include this guide.
export function setupGuide() {
  return `<details id="publish-guide" class="setup-guide">
        <summary>Publish with Cloudflare</summary>
        <div class="setup-content">
          <p class="hint">Your setup checklist for later. Start with the neutral demo; a Cloudflare account and GitHub repository are enough. No custom domain is needed.</p>
          <ol class="setup-steps">
            <li>
              <h2>Push the public application to GitHub</h2>
              <p>Commit and push the reviewed application files to <code>main</code>. Cloudflare builds what is on GitHub, so changes saved only on your computer will not appear.</p>
              <p>Keep <code>config/site.json</code>, <code>.private/</code>, <code>dist/</code>, and <code>dist-private/</code> Git-ignored. The committed <code>config/site.example.json</code> provides the neutral demo.</p>
            </li>
            <li>
              <h2>Create a Pages project</h2>
              <p>Open the <a href="https://dash.cloudflare.com/">Cloudflare dashboard</a>. Go to <strong>Workers &amp; Pages → Create application → Pages → Connect to Git</strong>. Dashboard labels may vary; choose Pages with Git integration.</p>
              <p>Connect GitHub and select your <code>cloudflare-link-protection</code> repository (or your fork). If it is missing, grant the Cloudflare GitHub app access to that repository.</p>
            </li>
            <li>
              <h2>Use these build settings</h2>
              <dl class="setup-settings">
                <dt>Project name</dt><dd><code>static-profile-demo</code>, if available; otherwise choose another name</dd>
                <dt>Production branch</dt><dd><code>main</code></dd>
                <dt>Framework preset</dt><dd>None</dd>
                <dt>Build command</dt><dd><code>npm run build:example</code></dd>
                <dt>Build output directory</dt><dd><code>dist</code></dd>
                <dt>Root directory</dt><dd>Leave blank (repository root)</dd>
              </dl>
              <p>Add these <strong>build environment variables</strong>:</p>
              <dl class="setup-settings">
                <dt><code>NODE_VERSION</code></dt><dd><code>22</code></dd>
                <dt><code>SKIP_DEPENDENCY_INSTALL</code></dt><dd><code>1</code></dd>
              </dl>
              <p>The static build needs no package installation. Leave <code>SITE_CONFIG_JSON</code> unset for this demo. The example build uses only the public sample.</p>
            </li>
            <li>
              <h2>Deploy and check the result</h2>
              <p>Select <strong>Save and Deploy</strong>. Once the build succeeds, open the HTTPS <code>pages.dev</code> address Cloudflare provides and bookmark it. The address is assigned during deployment.</p>
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
              <li><strong>Missing private configuration:</strong> check the build command is exactly <code>npm run build:example</code>.</li>
              <li><strong>Missing output:</strong> check the output directory is <code>dist</code> and the root directory is blank.</li>
              <li><strong>Repository missing:</strong> update the Cloudflare GitHub app's repository access.</li>
              <li><strong>Asked for a Worker deploy command:</strong> return to application creation and choose Pages.</li>
            </ul>
          </details>
          <h2>Later: analytics and your own domain</h2>
          <p>For free Web Analytics, open the Pages project's <strong>Metrics</strong> tab and select <strong>Enable</strong> under Web Analytics, then deploy again to add the beacon. When you have a domain, add it through <strong>Custom domains → Set up a domain</strong> and wait for DNS and HTTPS activation.</p>
          <p>Custom-zone WAF and Managed Challenge rules require a domain you control; they do not cover the project's <code>pages.dev</code> address. Test challenges in mobile in-app browsers before making them stricter.</p>
          <p>For a separately configured live site, follow <code>docs/cloudflare.md</code> and <code>docs/security.md</code> in the repository.</p>
          <p class="hint">Official references: <a href="https://developers.cloudflare.com/pages/get-started/git-integration/">Git deployment</a>, <a href="https://developers.cloudflare.com/pages/configuration/build-image/#skip-dependency-install">build environment</a>, <a href="https://developers.cloudflare.com/pages/how-to/web-analytics/">Web Analytics</a>, and <a href="https://developers.cloudflare.com/pages/configuration/custom-domains/">custom domains</a>.</p>
        </div>
      </details>`;
}
