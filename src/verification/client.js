// This file is only loaded on the verification screen, never on the links page.
const form = document.getElementById('verification-form');
const status = document.getElementById('verification-status');
const retry = document.getElementById('verification-retry');
const message = key => document.querySelector(`[data-message="${key}"]`)?.textContent || '';
let submitted = false;
let loadingTimer;
// GET cannot send a fragment to the Worker. Capture it before any script load
// can fail so a manual retry preserves it too. POST error pages already carry
// the complete original address in their server-validated hidden field.
if (location.pathname !== '/_verification/verify') {
  form.elements.returnTo.value = location.pathname + location.search + location.hash;
}

function show(key, canRetry = true) {
  status.textContent = message(key);
  retry.hidden = !canRetry;
}

function start() {
  const key = form.dataset.sitekey;
  if (!key) { show('unavailable'); return; }
  show('loading', false);
  loadingTimer = setTimeout(() => show('unavailable'), 15000);
  const render = () => {
    clearTimeout(loadingTimer);
    try {
      // Flexible widgets need at least 300px. Use Cloudflare's supported compact
      // layout when the configured card has less room, without scaling its UI.
      const size = document.getElementById('verification-widget').clientWidth < 300 ? 'compact' : 'flexible';
      window.turnstile.render('#verification-widget', {
        sitekey: key, theme: form.dataset.theme, size,
        action: 'profile_verification', cData: form.dataset.flow,
        'response-field': false, retry: 'never',
        'refresh-expired': 'manual', 'refresh-timeout': 'manual',
        callback(token) {
          if (submitted) return;
          submitted = true;
          show('verifying', false);
          form.elements.token.value = token;
          if (location.pathname !== '/_verification/verify') form.elements.returnTo.value = location.pathname + location.search + location.hash;
          form.submit();
        },
        'error-callback': () => { show('error'); return true; },
        'expired-callback': () => show('expired'),
        'timeout-callback': () => show('expired'),
        'unsupported-callback': () => show('unavailable'),
      });
    } catch { show('unavailable'); }
  };
  if (window.turnstile) { render(); return; }
  window.profileTurnstileReady = render;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=profileTurnstileReady&render=explicit';
  script.async = true;
  script.onerror = () => { clearTimeout(loadingTimer); show('unavailable'); };
  document.head.append(script);
}

retry.addEventListener('click', () => {
  // Reload the safe original document to obtain a fresh signed challenge cookie.
  // A failed POST can be retried without resubmitting its consumed Turnstile token.
  const target = new URL(form.elements.returnTo.value, location.origin);
  if (target.origin === location.origin) location.replace(target.href);
});
if (form.dataset.state === 'loading') start();
else { show(form.dataset.state); }
