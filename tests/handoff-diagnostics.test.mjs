import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeHandoffDiagnostics } from '../src/client/handoff-diagnostics.js';

const context = { platform: 'android', instagram: true };
const key = 'profile:handoff-diagnostics';
function fixture({ path = '/example/?handoff_debug=1', storage = new Map(), blocked = false } = {}) {
  const element = () => Object.assign(new EventTarget(), {
    children: [], setAttribute() {}, remove() {}, focus() {}, select() {},
    append(...items) { this.children.push(...items); },
  });
  const main = element();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible', createElement: element, querySelector: () => main,
  });
  const win = Object.assign(new EventTarget(), {
    location: new URL(`https://profile.example${path}`), document: doc,
    navigator: { userAgent: 'PRIVATE_RAW_UA', userActivation: { isActive: true } },
    sessionStorage: {
      getItem(k) { if (blocked) throw Error('unavailable'); return storage.get(k); },
      setItem(k, value) { if (blocked) throw Error('unavailable'); storage.set(k, value); },
      removeItem(k) { if (blocked) throw Error('unavailable'); storage.delete(k); },
    },
  });
  return { win, main, storage, report: () => main.children[0]?.children[1]?.value || '',
    event(detail) { win.dispatchEvent(new CustomEvent('profile:analytics', { detail })); },
  };
}

test('diagnostics are opt-in and never enabled on creator routes', () => {
  for (const path of ['/example/', '/sample-creator/?handoff_debug=1', '/']) {
    const f = fixture({ path });
    assert.equal(initializeHandoffDiagnostics(f.win, context), undefined);
    assert.equal(f.main.children.length, 0);
    assert.equal(f.storage.size, 0);
  }
  const f = fixture({ path: '/sample-creator/', storage: new Map([[key, '{"enabled":true,"rows":[]}']]) });
  assert.equal(initializeHandoffDiagnostics(f.win, context), undefined);
});

test('diagnostics preserve only sanitized events, lifecycle and activation in a bounded local report', t => {
  const f = fixture({ path: '/example/?handoff_debug=1&private=PRIVATE_QUERY' });
  const diagnostics = initializeHandoffDiagnostics(f.win, context); t.after(() => diagnostics.destroy());
  f.event({ name: 'handoff_attempt', trigger: 'cta', strategy: 'android-intent', target: 'PRIVATE_DESTINATION', userAgent: 'PRIVATE_RAW_UA' });
  f.event({ name: 'handoff_success', secret: 'PRIVATE_SECRET' });
  assert.match(f.report(), /ready build=local android instagram/);
  assert.match(f.report(), /handoff_attempt cta android-intent/);
  assert.match(f.report(), /gesture=true/);
  assert.doesNotMatch(f.report(), /PRIVATE|success|https:/);
  assert.doesNotMatch(f.storage.get(key), /PRIVATE|success|https:/);
  for (let i = 0; i < 100; i++) f.win.dispatchEvent(new Event('pagehide'));
  assert.equal(JSON.parse(f.storage.get(key)).rows.length, 40);
  assert.equal(f.report().split('\n').length, 40);
});

test('a Back to example navigation retains the first visit report; explicit opt-out clears it', () => {
  const first = fixture();
  const one = initializeHandoffDiagnostics(first.win, context);
  first.event({ name: 'handoff_attempt', trigger: 'cta', strategy: 'android-intent' });
  one.destroy();
  const second = fixture({ path: '/example/?_lp_handoff=1', storage: first.storage });
  const two = initializeHandoffDiagnostics(second.win, context);
  assert.equal((second.report().match(/ready build=/g) || []).length, 2);
  assert.match(second.report(), /handoff_attempt cta android-intent/);
  two.destroy();
  const off = fixture({ path: '/example/?handoff_debug=0', storage: first.storage });
  assert.equal(initializeHandoffDiagnostics(off.win, context), undefined);
  assert.equal(first.storage.has(key), false);
});

test('blocked or corrupt session storage leaves an in-memory diagnostic report usable', () => {
  for (const options of [{ blocked: true }, { storage: new Map([[key, 'not JSON']]) }]) {
    const f = fixture(options);
    const diagnostics = initializeHandoffDiagnostics(f.win, context);
    f.event({ name: 'fallback_shown', reason: 'unconfirmed', trigger: 'cta' });
    assert.match(f.report(), /fallback_shown unconfirmed cta/);
    diagnostics.destroy();
  }
});
