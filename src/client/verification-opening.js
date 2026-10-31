import { browserContext } from './browser-context.js';
import { guardedPageURL, openingPlan } from './browser-opening.js';
import { createHandoffController } from './handoff-controller.js';

// POST error pages must open the original GET page, never the verify endpoint.
// The server validates this hidden return path; retain a same-origin client check.
export function verificationPageURL(win, form) {
  if (win.location.pathname !== '/_verification/verify') return guardedPageURL(win.location.href)?.url ?? null;
  const value = form.elements.returnTo.value;
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value, win.location.origin);
    if (url.origin !== win.location.origin || url.pathname.startsWith('/_verification')) return null;
    return guardedPageURL(url.href)?.url ?? null;
  } catch { return null; }
}

export function initializeVerificationOpening(win = window) {
  const doc = win.document;
  const data = doc.getElementById('verification-opening-options');
  const form = doc.getElementById('verification-form');
  if (!data || !form) return;
  const options = JSON.parse(data.textContent);
  const context = browserContext(win.navigator);
  if (options.mode !== 'native' || !context.eligible || !verificationPageURL(win, form)) return;
  const manual = doc.getElementById('browser-open');
  const panel = doc.getElementById('handoff-panel');
  const status = doc.getElementById('handoff-status');
  const direct = doc.getElementById('handoff-direct');
  const retry = doc.getElementById('handoff-retry');
  const instructions = doc.getElementById('handoff-instructions');
  const labels = options.labels;
  const show = (state, attempt) => {
    if (!options.showManual) { panel.hidden = true; return; }
    panel.hidden = state === 'idle';
    if (!attempt) return;
    direct.href = attempt.plan.target;
    retry.hidden = state !== 'fallback_visible';
    status.textContent = state === 'attempted' ? labels.pending : labels.unconfirmed;
    instructions.textContent = context.platform === 'ios' ? labels.iosInstructions : labels.androidInstructions;
  };
  const controller = createHandoffController({ window: win, document: doc, delay: options.fallbackDelayMs, onState: show });
  const open = (target, automatic = false) => {
    const plan = openingPlan(target, options, context, { automatic });
    if (!controller.attempt(plan, { trigger: automatic ? 'automatic' : 'manual' })) {
      show('fallback_visible', { plan }); retry.hidden = true;
    }
  };
  if (manual) manual.hidden = !options.showManual;
  if (options.showManual) manual?.addEventListener('click', () => {
    const target = verificationPageURL(win, form);
    if (!target) return;
    if (win.location.pathname !== '/_verification/verify') controller.claimAutomatic();
    open(target);
  });
  if (options.showManual) retry.addEventListener('click', () => {
    const target = verificationPageURL(win, form);
    if (target) open(target);
  });
  doc.getElementById('handoff-dismiss').addEventListener('click', () => controller.dismiss());
  win.requestAnimationFrame(() => {
    // A pending/failed POST must never be reissued in another browser. Android
    // launches require a tap; all-scope age acknowledgment also defers automatic entry.
    if (!options.autoOpen || context.platform === 'android' || form.dataset.state !== 'loading' || win.location.pathname === '/_verification/verify') return;
    const target = controller.claimAutomatic();
    if (target) open(target, true);
  });
  return controller;
}

if (typeof window !== 'undefined') {
  try { initializeVerificationOpening(); } catch { /* Verification stays independent of browser assistance. */ }
}
