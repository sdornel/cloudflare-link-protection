import { escapeHTML, PLACEHOLDER_URL } from './config.mjs';
import { publicOptions } from './features.mjs';
import { setupGuide } from './setup-guide.mjs';

export const safeJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
};

function renderLink(link, primary = false, placeholderHref = PLACEHOLDER_URL) {
  const icon = icons[link.icon] ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[link.icon]}</svg>` : '';
  const placeholder = link.url === PLACEHOLDER_URL;
  const href = placeholder ? placeholderHref : link.url;
  return `<a class="link${primary ? ' link-primary' : ''}" href="${escapeHTML(href)}" data-link-id="${escapeHTML(link.id)}" data-opening-mode="${placeholder ? 'direct' : escapeHTML(link.openingMode)}" title="${placeholder ? 'More soon' : escapeHTML(new URL(link.url).hostname)}"><span>${escapeHTML(link.label)}</span>${icon}</a>`;
}

export function renderPage({ config, template, profile, share, assetVersion, clientVersion, enhanced = false, showSetupGuide = false, placeholderHref = PLACEHOLDER_URL }) {
  const indexable = Boolean(config.siteUrl && !config.placeholderLinks);
  const pagePath = config.profilePath && config.profilePath !== '/' ? `${config.profilePath}/` : '/';
  const assetBase = pagePath === '/' ? './' : pagePath;
  const siteURL = config.siteUrl ? new URL(pagePath, config.siteUrl).href : '';
  const seo = [];
  if (siteURL) {
    seo.push(`<link rel="canonical" href="${escapeHTML(siteURL)}">`, `<meta property="og:url" content="${escapeHTML(siteURL)}">`);
    if (share) seo.push(`<meta property="og:image" content="${escapeHTML(new URL(share.src, siteURL).href)}">`, `<meta property="og:image:alt" content="${escapeHTML(config.seo.imageAlt)}">`);
  }
  const tokens = {
    TITLE: escapeHTML(config.seo.title), DESCRIPTION: escapeHTML(config.description),
    NAME: escapeHTML(config.name), BIO: escapeHTML(config.bio), BACKGROUND: config.appearance.browserThemeColor,
    COLOR_SCHEME: config.appearance.colorScheme, ROBOTS: indexable ? 'index, follow' : 'noindex, follow', SEO: seo.join('\n    '),
    TWITTER_CARD: siteURL && share ? 'summary_large_image' : 'summary', ASSET_VERSION: assetVersion, ASSET_BASE: assetBase,
    AVATAR: profile ? `<img src="${escapeHTML(profile.src)}" alt="${escapeHTML(config.profile.alt)}" width="124" height="124" fetchpriority="high" decoding="async">` : `<span aria-hidden="true">${escapeHTML(config.profile.initials)}</span>`,
    PRIMARY_LINK: renderLink(config.primaryLink, true, placeholderHref),
    SECONDARY_LINKS: config.secondaryLinks.filter((link) => link.enabled).map((link) => renderLink(link, false, placeholderHref)).join('\n          '),
    PREVIEW_NOTE: config.placeholderLinks && config.previewNote ? `<p class="preview-note">${escapeHTML(config.previewNote)}</p>` : '',
    SETUP_GUIDE: showSetupGuide ? setupGuide() : '',
    ENHANCEMENTS: enhanced ? enhancements(config) : '',
    AGE_NOTICE: config.ageAcknowledgment.enabled ? ageNotice(config) : '',
    CLIENT: enhanced ? `<script id="profile-options" type="application/json">${safeJSON(publicOptions(config))}</script><script type="module" src="${assetBase}assets/${clientVersion}/app.js"></script>` : '',
    ANALYTICS: config.analytics.cloudflareToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${config.analytics.cloudflareToken}"}'></script>` : '',
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error('Unknown template token.');
    return tokens[key];
  });
  return { html, indexable, siteURL };
}

export function renderMoreSoon({ template, css, assetVersion, standalone = false }) {
  const tokens = {
    STYLES: standalone ? `<style>\n${css}</style>` : `<link rel="stylesheet" href="/example/styles.css?v=${assetVersion}">`,
    BACK_URL: standalone ? './example.html' : '/example/',
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error('Unknown placeholder template token.');
    return tokens[key];
  });
}

function ageNotice(config) {
  return `<section id="age-notice" class="notice" aria-label="Age acknowledgment"><p>${escapeHTML(config.ageAcknowledgment.message)}</p><button id="age-accept" class="quiet-button" type="button" hidden>I am 18 or older</button><p id="age-status" class="status" role="status"></p><noscript><p>Please acknowledge this notice before using the links. This is a self-attestation notice.</p></noscript></section>`;
}
function enhancements(config) {
  const text = config.browserOpening.labels;
  return `<div class="browser-tools"><button id="browser-open" class="quiet-button" type="button" hidden>${escapeHTML(text.open)}</button></div>
      <section id="handoff-panel" class="notice" aria-label="Browser assistance" hidden>
        <p id="handoff-status" class="status" role="status" aria-live="polite"></p>
        <p id="handoff-instructions" class="hint"></p>
        <div class="actions"><a id="handoff-direct" class="quiet-button" href="#links">${escapeHTML(text.continue)}</a><button id="handoff-retry" class="quiet-button" type="button" hidden>${escapeHTML(text.retry)}</button><button id="handoff-dismiss" class="quiet-button" type="button">${escapeHTML(text.dismiss)}</button></div>
      </section>
      ${config.analytics.ga4MeasurementId ? '<section id="analytics-consent" class="notice" aria-label="Optional analytics" hidden><p>Allow optional usage measurement to help improve this page?</p><p id="analytics-status" class="status" role="status"></p><div class="actions"><button id="analytics-allow" class="quiet-button" type="button">Allow analytics</button><button id="analytics-decline" class="quiet-button" type="button">Keep analytics off</button></div></section>' : ''}`;
}
