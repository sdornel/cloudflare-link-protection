import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeVerificationOpening, verificationPageURL } from '../src/client/verification-opening.js';
import { normalizeFeatures } from '../scripts/features.mjs';
import { SESSION_GUARD } from '../src/client/browser-opening.js';

function fixture({ userAgent = 'iPhone Instagram', href = 'https://profile.example/sample/?x=a%2Bb#links', state = 'loading', autoOpen = true, showManual = true, returnTo = '/sample/?x=a%2Bb#links' } = {}) {
  const elements = new Map(), timers = new Map(), storage = new Map(), frames = [], launches = [], metas = [];
  const options = normalizeFeatures({ browserOpening: { mode: 'native', autoOpen, showManual }, primaryLink: {}, secondaryLinks: [] }).browserOpening;
  for (const id of ['verification-opening-options', 'verification-form', 'browser-open', 'handoff-panel', 'handoff-status', 'handoff-direct', 'handoff-retry', 'handoff-instructions', 'handoff-dismiss']) {
    elements.set(id, Object.assign(new EventTarget(), { hidden: true, textContent: '' }));
  }
  elements.get('verification-opening-options').textContent = JSON.stringify(options);
  if (!showManual) elements.delete('browser-open');
  const form = elements.get('verification-form');
  form.dataset = { state }; form.elements = { returnTo: { value: returnTo } };
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible', getElementById: id => elements.get(id),
    createElement: () => ({ remove() {} }), head: { append: element => metas.push(element) },
  });
  const location = new URL(href); location.assign = value => launches.push(value);
  const win = Object.assign(new EventTarget(), {
    document: doc, navigator: { userAgent }, location,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { replaceState(_state, _title, value) { location.href = value; } },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  win.top = win.self = win;
  return { win, form, elements, launches, metas, storage, frames,
    click: id => elements.get(id).dispatchEvent(new Event('click')),
    tick: () => [...timers.values()].forEach(callback => callback()),
  };
}

test('gate automatic Instagram handoff shares the guard and retains full original address', () => {
  const f = fixture(); const controller = initializeVerificationOpening(f.win);
  assert.equal(f.elements.get('browser-open').hidden, false);
  f.frames[0]();
  assert.equal(f.storage.get(SESSION_GUARD), '1');
  assert.equal(f.metas.length, 1);
  const uri = f.metas[0].content.slice('0;url='.length);
  assert.equal(decodeURIComponent(uri.split('?url=')[1]), 'https://profile.example/sample/?x=a%2Bb&_lp_handoff=1#links');
  f.frames[0](); assert.equal(f.metas.length, 1);
  f.tick(); assert.equal(f.elements.get('handoff-panel').hidden, false);
  assert.match(f.elements.get('handoff-direct').href, /_lp_handoff=1#links$/);
  controller.destroy();
});

test('Facebook Android gate defers until a tap; ordinary browsers have no assistance or launch', () => {
  const f = fixture({ userAgent: 'Android [FBAN/FB4A;FBAV/500;]', href: 'https://profile.example/sample/?x=a%2Bb' });
  const controller = initializeVerificationOpening(f.win);
  f.frames[0](); assert.equal(f.launches.length, 0);
  f.click('browser-open');
  assert.equal(f.launches.length, 1); assert.match(f.launches[0], /^intent:\/\//);
  assert.equal(f.storage.get(SESSION_GUARD), '1');
  controller.destroy();
  const ordinary = fixture({ userAgent: 'iPhone Safari' });
  assert.equal(initializeVerificationOpening(ordinary.win), undefined);
  assert.equal(ordinary.elements.get('browser-open').hidden, true);
  assert.equal(ordinary.frames.length, 0);
});

test('failed verification opens the original GET page manually, never the POST endpoint', () => {
  const f = fixture({ userAgent: 'iPhone [FBAN/FBIOS;FBAV/500;]', href: 'https://profile.example/_verification/verify', state: 'error' });
  const controller = initializeVerificationOpening(f.win);
  f.frames[0](); assert.equal(f.launches.length, 0);
  f.click('browser-open');
  assert.equal(f.launches[0], 'x-safari-https://profile.example/sample/?x=a%2Bb&_lp_handoff=1#links');
  assert.doesNotMatch(f.launches[0], /instagram:|_verification\/verify/);
  controller.destroy();
});

test('return URL validation rejects external and internal verification targets', () => {
  for (const returnTo of ['//elsewhere.example/', '/\\elsewhere.example', '/_verification/verify', 'https://elsewhere.example/', '/sample/bad path']) {
    const f = fixture({ href: 'https://profile.example/_verification/verify', returnTo });
    assert.equal(verificationPageURL(f.win, f.form), null);
    assert.equal(initializeVerificationOpening(f.win), undefined);
  }
});

test('disabled automatic mode and existing handoff marker prevent entry relaunches', () => {
  for (const override of [{ autoOpen: false }, { href: 'https://profile.example/sample/?_lp_handoff=1' }]) {
    const f = fixture(override); const controller = initializeVerificationOpening(f.win);
    f.frames[0](); assert.equal(f.metas.length + f.launches.length, 0);
    controller.destroy();
  }
});

test('automatic-only gate works without a manual button and never reveals retry offers', () => {
  const f = fixture({ showManual: false });
  const controller = initializeVerificationOpening(f.win);
  assert.equal(f.elements.has('browser-open'), false);
  f.frames[0](); assert.equal(f.metas.length, 1);
  assert.equal(f.elements.get('handoff-panel').hidden, true);
  f.tick(); assert.equal(f.elements.get('handoff-panel').hidden, true);
  f.click('handoff-retry'); assert.equal(f.launches.length, 0);
  f.frames[0](); assert.equal(f.metas.length, 1);
  controller.destroy();
  const android = fixture({ showManual: false, userAgent: 'Android Instagram' });
  const androidController = initializeVerificationOpening(android.win);
  android.frames[0]();
  assert.equal(android.launches.length, 0);
  assert.equal(android.elements.get('handoff-panel').hidden, true);
  androidController.destroy();
});
