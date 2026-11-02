import { isPlainActivation, openingPlan } from './browser-opening.js';
import { createHandoffController } from './handoff-controller.js';

// Navigation UX only: no access-control decisions or different crawler content.
// Shared by the profile and the branded verification screen.
export function requireExternalBrowser({ window: win, options, context, targetURL, track = () => {}, allowAutomatic = true }) {
  if (!options.requireExternalBrowser || options.mode !== 'native' || !context.eligible) return null;
  const doc = win.document;
  const dialog = doc.getElementById('external-browser-dialog');
  const main = doc.querySelector('main');
  const button = doc.getElementById('external-browser-open');
  const title = doc.getElementById('external-browser-title');
  const target = targetURL();
  if (!dialog || !main || !button || !title || !target) return null;
  const labels = options.labels;
  const chrome = context.platform === 'android' ? options.androidPackage === 'com.android.chrome' : options.iosStrategy === 'chrome';
  let automaticAttempted = false;
  let needsDialog = false;
  const show = () => {
    needsDialog = true;
    if (doc.visibilityState !== 'visible' || doc.prerendering) return;
    title.textContent = automaticAttempted
      ? (chrome ? labels.externalChromeUnconfirmed : labels.externalUnconfirmed)
      : labels.externalTitle;
    button.removeAttribute('aria-disabled');
    if (dialog.open) return;
    try { dialog.showModal(); }
    catch { dialog.setAttribute('open', ''); }
    button.focus();
  };
  const controller = createHandoffController({ window: win, document: doc, delay: options.fallbackDelayMs, track,
    onState(state) {
      if (state === 'fallback_visible') show();
      else if (state === 'attempted') {
        needsDialog = false;
        button.setAttribute('aria-disabled', 'true');
      }
    },
  });
  const planFor = (url, automatic = false) => openingPlan(url, options, context, { automatic });
  const strategy = (plan, trigger) => track('browser_strategy', { link_id: 'page', strategy: plan.strategy, reason: plan.reason, trigger });
  button.href = target;
  button.addEventListener('click', event => {
    if (!isPlainActivation(event, button)) return;
    if (button.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
    const plan = planFor(targetURL());
    strategy(plan, 'manual');
    // An unsupported intent must not silently navigate within the app, or
    // discard URL bytes. The app-menu instructions remain available instead.
    if (plan.strategy === 'direct') { event.preventDefault(); show(); return; }
    const previous = controller.active;
    if (plan.strategy !== 'android-intent') event.preventDefault();
    const handled = controller.attempt(plan, { id: 'page', trigger: 'manual', anchor: button });
    if (!handled || controller.active === previous || controller.active.state !== 'attempted'
      || (plan.strategy === 'android-intent' && button.getAttribute('href') !== plan.uri)) event.preventDefault();
  });
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('keydown', event => {
    // One focusable control, including browsers without showModal support.
    if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
  });
  doc.addEventListener('visibilitychange', () => { if (needsDialog) show(); });
  doc.addEventListener('prerenderingchange', () => { if (needsDialog) show(); });
  main.inert = true;
  // The verification client checks this after deferred modules have settled.
  doc.documentElement.dataset.externalBrowserRequired = 'true';
  win.requestAnimationFrame(() => {
    if (allowAutomatic && options.autoOpen && (context.platform !== 'android' || options.androidAutoOpen)) {
      const url = controller.claimAutomatic();
      if (url) {
        const plan = planFor(url, true);
        strategy(plan, 'automatic');
        automaticAttempted = plan.strategy !== 'direct';
        if (controller.attempt(plan, { id: 'page', trigger: 'automatic' })) return;
      }
    }
    show();
  });
  return controller;
}
