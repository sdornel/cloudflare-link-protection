import { browserContext } from './browser-context.js';
import { guardedPageURL, isPlainActivation, openingPlan } from './browser-opening.js';
import { createHandoffController } from './handoff-controller.js';
import { createAnalytics } from './analytics.js';
import { createAgeAcknowledgment } from './age-acknowledgment.js';

export function initialize(win = window) {
  const doc = win.document;
  const data = doc.getElementById('profile-options');
  if (!data) return;
  const options = JSON.parse(data.textContent);
  const context = browserContext(win.navigator);
  let analytics = { track() {}, setConsent() {}, permitted: false };
  try { analytics = createAnalytics(win, options.analytics); } catch {}
  const track = (name, fields = {}) => { try { analytics.track(name, { platform: context.platform, ...fields }); } catch {} };
  let automaticPage = () => {};
  const age = createAgeAcknowledgment({ window: win, document: doc, options: options.ageAcknowledgment, track, onAccepted: () => automaticPage(true) });
  const panel = doc.getElementById('handoff-panel');
  const status = doc.getElementById('handoff-status');
  const fallback = doc.getElementById('handoff-direct');
  const retry = doc.getElementById('handoff-retry');
  const instructions = doc.getElementById('handoff-instructions');
  const labels = options.browserOpening.labels;
  const controller = createHandoffController({ window: win, document: doc, delay: options.browserOpening.fallbackDelayMs, track,
    onState(state, attempt) {
      if (!panel) return;
      panel.hidden = state === 'idle';
      if (!attempt) return;
      fallback.href = attempt.plan.target;
      fallback.dataset.linkId = attempt.id;
      status.textContent = state === 'attempted' ? labels.pending : state === 'page_hidden_observed' ? '' : labels.unconfirmed;
      retry.hidden = state !== 'fallback_visible';
      instructions.textContent = context.platform === 'ios' ? labels.iosInstructions : labels.androidInstructions;
    },
  });
  const planFor = (url, mode, automatic = false) => openingPlan(url, { ...options.browserOpening, mode }, context, { automatic });
  const navigate = (plan, id, trigger) => {
    track('browser_strategy', { link_id: id, strategy: plan.strategy, reason: plan.reason, trigger });
    return controller.attempt(plan, { id, trigger });
  };
  function activate(anchor, event) {
    if (!isPlainActivation(event, anchor)) return;
    const id = anchor.dataset.linkId;
    const mode = anchor.dataset.openingMode === 'inherit' ? options.browserOpening.mode : anchor.dataset.openingMode;
    const plan = planFor(anchor.getAttribute('href'), mode);
    const resume = () => {
      track('outbound_click', { link_id: id });
      if (!navigate(plan, id, 'cta')) win.location.assign(anchor.href);
    };
    if (age.request(resume)) { event.preventDefault(); return; }
    track('outbound_click', { link_id: id });
    track('browser_strategy', { link_id: id, strategy: plan.strategy, reason: plan.reason, trigger: 'cta' });
    if (plan.strategy === 'direct') return;
    event.preventDefault();
    if (!controller.attempt(plan, { id, trigger: 'cta' })) win.location.assign(anchor.href);
  }
  for (const anchor of doc.querySelectorAll('a[data-opening-mode]')) {
    anchor.addEventListener('click', (event) => {
      try { activate(anchor, event); } catch {
        // If interception already happened, restore an ordinary navigation.
        if (event.defaultPrevented) win.location.assign(anchor.href);
      }
    });
  }
  fallback?.addEventListener('click', (event) => {
    if (!isPlainActivation(event, fallback)) return;
    const proceed = () => { track('fallback_click', { link_id: fallback.dataset.linkId }); controller.dismiss(); win.location.assign(fallback.href); };
    if (age.request(proceed)) { event.preventDefault(); return; }
    track('fallback_click', { link_id: fallback.dataset.linkId });
    controller.dismiss(); // The anchor's default navigation remains intact.
  });
  retry?.addEventListener('click', () => {
    const active = controller.active;
    if (active) controller.attempt(active.plan, { id: active.id, trigger: 'retry' });
  });
  doc.getElementById('handoff-dismiss')?.addEventListener('click', () => controller.dismiss());
  const manual = doc.getElementById('browser-open');
  if (manual && options.browserOpening.mode === 'native' && options.browserOpening.showManual && context.eligible && guardedPageURL(win.location.href)) {
    manual.hidden = false;
    manual.addEventListener('click', () => {
      const action = () => {
        const target = guardedPageURL(win.location.href)?.url;
        if (!target) return;
        const plan = planFor(target, 'native');
        if (!navigate(plan, 'page', 'manual')) {
          panel.hidden = false; fallback.href = target; fallback.dataset.linkId = 'page'; retry.hidden = true;
          status.textContent = labels.unconfirmed;
          instructions.textContent = context.platform === 'ios' ? labels.iosInstructions : labels.androidInstructions;
          track('fallback_shown', { link_id: 'page', reason: plan.reason });
        }
      };
      if (!age.request(action)) action();
    });
  }
  const consent = doc.getElementById('analytics-consent');
  const consentStatus = doc.getElementById('analytics-status');
  if (consent && options.analytics.ga4MeasurementId) {
    consent.hidden = false;
    const update = () => { consentStatus.textContent = analytics.permitted ? 'Optional analytics are enabled.' : 'Optional analytics are off.'; };
    doc.getElementById('analytics-allow').addEventListener('click', () => { analytics.setConsent(true); update(); });
    doc.getElementById('analytics-decline').addEventListener('click', () => { analytics.setConsent(false); update(); });
    update();
  }
  let viewed = false;
  const visit = () => { if (!viewed && doc.visibilityState === 'visible' && !doc.prerendering) { viewed = true; track('landing_view'); } };
  visit(); doc.addEventListener('visibilitychange', visit); doc.addEventListener('prerenderingchange', visit);
  automaticPage = (userActivation = false) => {
    if (options.browserOpening.mode !== 'native' || !options.browserOpening.autoOpen || !context.eligible || !age.accepted) return;
    if (context.platform === 'android' && !userActivation) { track('handoff_deferred', { reason: 'gesture_required', trigger: 'automatic' }); return; }
    const target = controller.claimAutomatic();
    if (target) navigate(planFor(target, 'native', !userActivation), 'page', userActivation ? 'manual' : 'automatic');
  };
  win.requestAnimationFrame(() => automaticPage());
  return { controller, analytics, age };
}

if (typeof window !== 'undefined') {
  try { initialize(); } catch { /* Static anchors remain the reliable baseline. */ }
}
