const EVENTS = new Set(['landing_view', 'outbound_click', 'browser_strategy', 'handoff_attempt', 'handoff_deferred', 'handoff_page_hidden', 'handoff_unconfirmed', 'handoff_returned', 'fallback_shown', 'fallback_click', 'age_acknowledged']);
const VALUES = {
  strategy: new Set(['direct', 'ios-instagram', 'ios-safari', 'ios-chrome', 'android-intent']),
  platform: new Set(['ios', 'android', 'other']),
  trigger: new Set(['automatic', 'manual', 'cta', 'retry']),
  reason: new Set(['invalid_url', 'ordinary_navigation', 'unsupported_strategy', 'gesture_required', 'intent_url_unsupported', 'invalid_package', 'unsupported_context', 'unconfirmed', 'launch_error', 'returned']),
};
export function eventDetail(name, fields = {}) {
  if (!EVENTS.has(name)) return null;
  const clean = { name };
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'link_id' && typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value)) clean[key] = value;
    else if (VALUES[key]?.has(value)) clean[key] = value;
  }
  return clean;
}

export function createAnalytics(win, options = {}) {
  let permitted = options.ga4Consent === 'granted', ready = false, started = false, failed = false, viewSent = false;
  let queue = [], script;
  const id = options.ga4MeasurementId;
  const cleanLocation = () => `${win.location.origin}${win.location.pathname}`;
  const cleanReferrer = () => { try { return new URL(win.document.referrer).origin; } catch { return ''; } };
  const send = (detail) => {
    if (!permitted || !id || failed) return;
    if (detail.name === 'landing_view' && viewSent) return;
    if (!ready) { if (queue.length < 30) queue.push(detail); return; }
    try {
      const { name, ...fields } = detail;
      // Claim before calling the adapter, including when it throws or re-enters.
      if (name === 'landing_view') viewSent = true;
      win.gtag('event', name === 'landing_view' ? 'page_view' : name, { ...fields, page_location: cleanLocation(), page_referrer: cleanReferrer(), page_title: 'Profile links', transport_type: 'beacon' });
    } catch {}
  };
  function start() {
    if (started || !permitted || !/^G-[A-Z0-9]{4,20}$/.test(id ?? '') || !/^https?:$/.test(win.location.protocol)) return;
    started = true;
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
    win.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    win.gtag('js', new Date());
    win.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: cleanLocation(), page_referrer: cleanReferrer(), page_title: 'Profile links' });
    script = win.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.onload = () => { ready = true; const pending = queue; queue = []; for (const item of pending) send(item); };
    script.onerror = () => { failed = true; queue = []; };
    win.document.head.append(script);
  }
  const track = (name, fields) => {
    const detail = eventDetail(name, fields);
    if (!detail) return;
    try { win.dispatchEvent(new win.CustomEvent('profile:analytics', { detail })); } catch {}
    if (options.debug) { try { win.console.debug('[profile]', detail); } catch {} }
    try { send(detail); } catch {}
  };
  try { start(); } catch { failed = true; queue = []; }
  return {
    track,
    setConsent(granted) {
      if (permitted === Boolean(granted)) return;
      permitted = Boolean(granted); queue = [];
      if (id) win[`ga-disable-${id}`] = !permitted;
      if (!permitted) {
        try { if (started) win.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch {}
        return;
      }
      try {
        if (started) win.gtag('consent', 'update', { analytics_storage: 'granted' });
        else start();
        // Count the current view only; do not replay pre-consent interactions.
        send({ name: 'landing_view' });
      } catch { failed = true; }
    },
    get permitted() { return permitted; },
  };
}
