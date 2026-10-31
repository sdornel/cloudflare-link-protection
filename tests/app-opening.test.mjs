import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeFeatures, publicOptions } from '../scripts/features.mjs';
import { initialize } from '../src/client/app.js';

const sample = JSON.parse(await readFile(new URL('../config/site.example.json', import.meta.url), 'utf8'));
const origin = 'https://profile.example';
const destination = `${origin}/example/more-soon/`;

// Exercise real handlers/controller and model default anchor navigation.
// This models DOM events and timers, not Android/Instagram's intent handling.
function fixture(userAgent = 'Mozilla/5.0 (Linux; Android 14) Instagram 300') {
  const elements = new Map(), storage = new Map(), timers = new Map(), frames = [], navigations = [], scriptNavigations = [];
  let timerId = 0;
  for (const id of ['profile-options', 'handoff-panel', 'handoff-status', 'handoff-direct', 'handoff-retry', 'handoff-instructions', 'handoff-dismiss']) {
    elements.set(id, Object.assign(new EventTarget(), { hidden: true, textContent: '', dataset: {}, target: '', hasAttribute: () => false }));
  }
  elements.get('profile-options').textContent = JSON.stringify(publicOptions(normalizeFeatures(sample)));
  let href = '/example/more-soon/';
  const anchor = Object.assign(new EventTarget(), {
    target: '', dataset: { linkId: sample.primaryLink.id, openingMode: 'inherit' },
    getAttribute: name => name === 'href' ? href : null, hasAttribute: () => false,
    setAttribute(name, value) { if (name === 'href') href = value; },
  });
  Object.defineProperty(anchor, 'href', { get: () => new URL(href, origin).href });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible', getElementById: id => elements.get(id),
    querySelectorAll: selector => selector === 'a[data-opening-mode]' ? [anchor] : [],
  });
  const location = new URL(`${origin}/example/?source=test&encoded=%20&plus=+`);
  location.assign = value => { navigations.push(value); scriptNavigations.push(value); };
  const win = Object.assign(new EventTarget(), {
    document: doc, navigator: { userAgent }, location, CustomEvent,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { replaceState(_state, _title, value) { location.href = value; } },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  win.top = win.self = win;
  const app = initialize(win);
  return { win, app, elements, anchor, navigations, scriptNavigations,
    frame() { frames.splice(0).forEach(callback => callback()); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    click(link = anchor) {
      const event = new Event('click', { cancelable: true });
      link.dispatchEvent(event);
      if (!event.defaultPrevented) navigations.push(link.href);
      return event;
    },
  };
}

test('first CTA after an arrival pagehide observation does not silently navigate directly', t => {
  const f = fixture(); t.after(() => f.app.controller.destroy());
  f.frame();
  // A lifecycle observation must not veto the next actual visible-page tap.
  // This deliberately omits pageshow/visibilitychange to expose stale state.
  f.win.dispatchEvent(new Event('pagehide'));
  assert.equal(f.win.document.visibilityState, 'visible');
  assert.equal(f.app.controller.active.state, 'page_hidden_observed');
  f.click();
  assert.equal(f.navigations.length, 2);
  assert.ok(f.navigations[1].startsWith(`intent://${destination.slice(8)}#Intent;`),
    `First tap must issue an intent, not navigate directly to ${f.navigations[1]}`);
  assert.equal(f.app.controller.active.trigger, 'cta');
});

for (const phase of ['before arrival', 'arrival pending', 'arrival timed out']) {
  test(`first Android CTA attempts its destination synchronously: ${phase}`, t => {
    const f = fixture(); t.after(() => f.app.controller.destroy());
    if (phase !== 'before arrival') {
      f.frame();
      assert.equal(f.navigations.length, 1);
      assert.ok(f.navigations[0].startsWith(`intent://${f.win.location.href.slice(8)}#Intent;`));
      // A blocked automatic launch must not request a self-redirect.
      assert.doesNotMatch(f.navigations[0], /S.browser_fallback_url=/);
      if (phase === 'arrival timed out') f.tick();
    }
    const before = f.navigations.length;
    assert.equal(f.click().defaultPrevented, false);
    // No timer, return trip or second tap is needed to issue this intent.
    assert.equal(f.navigations.length, before + 1);
    const intent = f.navigations.at(-1);
    assert.ok(intent.startsWith(`intent://${destination.slice(8)}#Intent;`));
    assert.doesNotMatch(intent, /S.browser_fallback_url=/);
    assert.equal(f.scriptNavigations.length, before, 'CTA must use default link activation, not location.assign');
    assert.equal(f.anchor.getAttribute('href'), intent);
    f.frame(); f.tick();
    assert.equal(f.anchor.getAttribute('href'), '/example/more-soon/');
    assert.equal(f.navigations.length, before + 1);
    assert.equal(f.elements.get('handoff-direct').href, destination);
    assert.equal(f.elements.get('handoff-panel').hidden, false);
    assert.ok(f.navigations.every(value => value.startsWith('intent://')),
      'No automatic navigation to More soon before Continue here is chosen');
    f.click(f.elements.get('handoff-direct'));
    assert.equal(f.navigations.at(-1), destination);
  });
}

test('ordinary Android Chrome keeps the first CTA as a normal link', t => {
  const f = fixture('Mozilla/5.0 (Linux; Android 14) Chrome/130.0');
  t.after(() => f.app.controller.destroy());
  f.frame();
  assert.equal(f.navigations.length, 0);
  assert.equal(f.click().defaultPrevented, false);
  assert.deepEqual(f.navigations, [destination]);
  assert.equal(f.elements.get('handoff-panel').hidden, true);
});

test('duplicate Android activation cannot follow the temporarily modified href twice', t => {
  const f = fixture(); t.after(() => f.app.controller.destroy());
  assert.equal(f.click().defaultPrevented, false);
  assert.equal(f.click().defaultPrevented, true);
  assert.equal(f.navigations.length, 1);
  assert.deepEqual(f.scriptNavigations, []);
  f.win.dispatchEvent(new Event('pagehide'));
  assert.equal(f.anchor.getAttribute('href'), '/example/more-soon/');
  f.tick();
  assert.equal(f.navigations.length, 1);
});

test('failure to prepare the intent anchor cancels navigation and exposes the exact fallback', t => {
  const f = fixture(); t.after(() => f.app.controller.destroy());
  f.anchor.setAttribute = () => { throw Error('Cannot modify link'); };
  assert.equal(f.click().defaultPrevented, true);
  assert.deepEqual(f.navigations, []);
  assert.equal(f.elements.get('handoff-direct').href, destination);
  assert.equal(f.elements.get('handoff-panel').hidden, false);
});
