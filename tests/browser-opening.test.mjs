import assert from 'node:assert/strict';
import test from 'node:test';
import { browserContext } from '../src/client/browser-context.js';
import { guardedPageURL, isHTTPS, isPlainActivation, openingPlan, PLACEHOLDER_URL } from '../src/client/browser-opening.js';
import { createHandoffController } from '../src/client/handoff-controller.js';
const ios = browserContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 300' });
const android = browserContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Instagram 300' });

test('only recognized mobile in-app contexts get native handling', () => {
  assert.equal(ios.eligible, true); assert.equal(android.platform, 'android');
  for (const ua of ['Mozilla/5.0 iPhone Safari', 'Mozilla/5.0 Android Chrome', 'Instagram Windows NT', '', 'OtherApp iPhone']) {
    assert.equal(browserContext({ userAgent: ua }).eligible, false);
    assert.equal(openingPlan('https://example.com/', { mode: 'native' }, browserContext({ userAgent: ua })).strategy, 'direct');
  }
  assert.equal(browserContext({ userAgent: 'Instagram Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }).platform, 'ios');
});

test('nested iOS URL preserves query bytes, Unicode, repeated keys and fragment exactly', () => {
  const target = 'https://example.com/é?a=1&a=2&space=%20&plus=+&nested=https%3A%2F%2Fexample.org%2F%3Fa%3Db#section';
  const plan = openingPlan(target, { mode: 'native' }, ios, { pageURL: 'https://profile.example/example/' });
  assert.equal(decodeURIComponent(plan.uri.split('?url=')[1]), target);
  assert.equal(plan.fallback, target);
  assert.equal(openingPlan(target, { mode: 'native', iosStrategy: 'safari' }, ios).uri, target.replace('https:', 'x-safari-https:'));
  assert.equal(openingPlan(target, { mode: 'direct' }, ios).strategy, 'direct');
});

test('neutral destination uses the current HTTPS origin for native handoff and fallback', () => {
  const pageURL = 'https://profile.example/example/?next=https%3A%2F%2Fother.example&source=ig#links';
  const expected = 'https://profile.example/example/more-soon/';
  for (const context of [ios, android]) {
    const plan = openingPlan(PLACEHOLDER_URL, { mode: 'native' }, context, { pageURL });
    assert.equal(plan.target, expected);
    assert.equal(plan.fallback, expected);
    if (context.platform === 'ios') {
      assert.equal(plan.strategy, 'ios-instagram');
      assert.equal(decodeURIComponent(plan.uri.split('?url=')[1]), expected);
    } else {
      assert.equal(plan.strategy, 'android-intent');
      assert.doesNotMatch(plan.uri, /S.browser_fallback_url=/);
    }
  }
  assert.equal(openingPlan(PLACEHOLDER_URL, { mode: 'native' }, android, { pageURL, automatic: true }).reason, 'gesture_required');
  assert.equal(openingPlan(PLACEHOLDER_URL, { mode: 'direct' }, ios, { pageURL }).strategy, 'direct');
  assert.equal(openingPlan(PLACEHOLDER_URL, { mode: 'native' }, { eligible: false }, { pageURL }).strategy, 'direct');
});

test('neutral resolution excludes HTTP, files, other relative paths and destination parameters', () => {
  for (const pageURL of [undefined, 'http://localhost:4173/example/', 'file:///tmp/example.html', 'invalid', 'https://user:password@profile.example/']) {
    const plan = openingPlan(PLACEHOLDER_URL, { mode: 'native' }, ios, { pageURL });
    assert.equal(plan.strategy, 'direct');
    assert.equal(plan.target, PLACEHOLDER_URL);
  }
  for (const target of ['//other.example/', '/other/', `${PLACEHOLDER_URL}?next=https://other.example/`, `${PLACEHOLDER_URL}#links`, './more-soon.html']) {
    assert.equal(openingPlan(target, { mode: 'native' }, ios, { pageURL: 'https://profile.example/example/' }).strategy, 'direct');
  }
});

test('Facebook detection enables mobile assistance without invoking Instagram from Facebook', () => {
  const target = 'https://example.com/path?x=a%2Bb#links';
  const facebookIOS = browserContext({ userAgent: 'Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/500.0;]' });
  const facebookAndroid = browserContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15) [FBAN/FB4A;FBAV/500.0;]' });
  assert.equal(facebookIOS.eligible, true);
  assert.equal(facebookAndroid.eligible, true);
  assert.equal(facebookIOS.instagram, false);
  assert.equal(openingPlan(target, { mode: 'native' }, facebookIOS).uri, 'x-safari-https://example.com/path?x=a%2Bb#links');
  assert.equal(openingPlan(target, { mode: 'native', iosStrategy: 'chrome' }, facebookIOS).uri, 'googlechromes://example.com/path?x=a%2Bb#links');
  for (const userAgent of ['Mozilla/5.0 iPhone Safari Facebook', 'Mozilla/5.0 Windows [FBAV/500.0;]']) assert.equal(browserContext({ userAgent }).eligible, false);
  const plan = openingPlan('https://example.com/?x=a%2Bb', { mode: 'native', androidPackage: 'default' }, facebookAndroid);
  assert.equal(plan.strategy, 'android-intent');
  assert.doesNotMatch(plan.uri, /;package=/);
  assert.equal(plan.fallback, 'https://example.com/?x=a%2Bb');
  assert.doesNotMatch(plan.uri, /S.browser_fallback_url=/);
  assert.equal(openingPlan(target, { mode: 'native' }, facebookAndroid, { automatic: true }).reason, 'gesture_required');
});

test('Android intent preserves its target but leaves direct fallback to an explicit page link', () => {
  const target = 'https://example.com/path?a=1&a=2&space=%20&plus=+';
  const plan = openingPlan(target, { mode: 'native' }, android);
  assert.equal(plan.uri, `intent://${target.slice(8)}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end`);
  assert.equal(plan.fallback, target);
  for (const suffix of ['#section', '#Intent;package=evil;end', '?x=one;two']) {
    assert.equal(openingPlan(target + suffix, { mode: 'native' }, android).strategy, 'direct');
  }
  assert.equal(openingPlan(target, { mode: 'native' }, android, { automatic: true }).reason, 'gesture_required');
  assert.equal(openingPlan(target, { mode: 'native', androidPackage: 'evil;scheme=file' }, android).strategy, 'direct');
  for (const value of ['javascript:alert(1)', 'https://a:b@example.com/', 'https://example.com\\@evil.test/', ' https://example.com/', 'https://example.com/\n']) assert.equal(isHTTPS(value), false);
});

test('same-page guard retains original query serialization and fragment without changing outgoing links', () => {
  const input = 'https://example.com/?a=%20&a=2&plus=+#latest';
  assert.deepEqual(guardedPageURL(input), { marked: false, url: 'https://example.com/?a=%20&a=2&plus=+&_lp_handoff=1#latest' });
  assert.equal(guardedPageURL('https://example.com/?_lp_handoff=anything').marked, true);
  assert.equal(guardedPageURL('file:///tmp/index.html'), null);
});

test('Android arrival keeps the guarded target without requesting a fallback reload', () => {
  const target = guardedPageURL('https://profile.example/example/?a=%20&a=2&plus=+').url;
  const config = { mode: 'native', androidAutoOpen: true };
  const plan = openingPlan(target, config, android, { automatic: true });
  assert.equal(plan.strategy, 'android-intent');
  assert.equal(plan.target, target);
  assert.equal(plan.fallback, target);
  assert.equal(plan.uri, `intent://${target.slice(8)}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end`);
  // Explicit taps also leave fallback navigation to the page's Continue here link.
  const tapped = openingPlan(target, config, android);
  assert.equal(tapped.fallback, target);
  assert.doesNotMatch(tapped.uri, /S.browser_fallback_url=/);
  for (const androidAutoOpen of [undefined, false]) {
    assert.equal(openingPlan(target, { ...config, androidAutoOpen }, android, { automatic: true }).reason, 'gesture_required');
  }
  assert.equal(openingPlan(target, { ...config, mode: 'direct' }, android, { automatic: true }).strategy, 'direct');
  assert.equal(openingPlan(target, config, browserContext({ userAgent: 'Android Chrome' }), { automatic: true }).strategy, 'direct');
  for (const suffix of ['#links', ';extra']) {
    assert.equal(openingPlan(target + suffix, config, android, { automatic: true }).reason, 'intent_url_unsupported');
  }
});

test('modified clicks and alternative anchor targets retain browser behavior', () => {
  const anchor = { target: '', hasAttribute: () => false };
  assert.equal(isPlainActivation({ button: 0 }, anchor), true);
  for (const event of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) assert.equal(isPlainActivation(event, anchor), false);
  assert.equal(isPlainActivation({}, { ...anchor, target: '_blank' }), false);
  assert.equal(isPlainActivation({}, { ...anchor, hasAttribute: () => true }), false);
});

function harness({ storageFails = false, historyFails = false, href = 'https://example.com/?source=test#links' } = {}) {
  const win = new EventTarget(), doc = new EventTarget();
  let timers = new Map(), counter = 0;
  const storage = new Map(), events = [], states = [], launches = [];
  doc.visibilityState = 'visible';
  win.self = win; win.top = win;
  win.location = { href };
  win.history = { state: { preserved: true }, replaceState(state, _, value) { if (historyFails) throw Error(); win.location.href = value; } };
  win.sessionStorage = { getItem(key) { if (storageFails) throw Error(); return storage.get(key); }, setItem(key, value) { if (storageFails) throw Error(); storage.set(key, value); } };
  win.setTimeout = (fn) => { const id = ++counter; timers.set(id, fn); return id; };
  win.clearTimeout = (id) => timers.delete(id);
  const options = { window: win, document: doc, track: (name, detail) => events.push({ name, ...detail }), onState: (state) => states.push(state), launch: (plan) => { launches.push(plan); return () => {}; } };
  const controller = createHandoffController(options);
  return { win, doc, controller, events, states, launches, options,
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    visibility(state) { doc.visibilityState = state; doc.dispatchEvent(new Event('visibilitychange')); },
  };
}
const plan = openingPlan('https://example.com/projects?q=1', { mode: 'native' }, ios);

test('unconfirmed attempts show direct fallback; retry is explicit; dismissal cancels stale timers', () => {
  const h = harness();
  h.controller.attempt(plan, { id: 'projects', trigger: 'cta' });
  h.controller.attempt(plan); assert.equal(h.launches.length, 1);
  h.tick(); assert.equal(h.controller.active.state, 'fallback_visible');
  assert.equal(h.controller.active.plan.fallback, plan.target);
  assert.ok(h.events.some(event => event.name === 'handoff_unconfirmed'));
  assert.ok(!h.events.some(event => /success/.test(event.name)));
  h.controller.attempt(plan, { trigger: 'retry' }); assert.equal(h.launches.length, 2);
  h.controller.dismiss(); h.tick(); assert.equal(h.controller.active, null);
});

test('hidden page cancels fallback timer; returning offers help without launching again', () => {
  const h = harness(); h.controller.attempt(plan); h.visibility('hidden'); h.tick();
  assert.equal(h.controller.active.state, 'page_hidden_observed');
  assert.ok(!h.events.some(event => event.name === 'fallback_shown'));
  h.visibility('visible'); assert.equal(h.controller.active.state, 'fallback_visible');
  h.win.dispatchEvent(new Event('pageshow')); assert.equal(h.launches.length, 1);
  assert.equal(h.events.filter(event => event.name === 'handoff_returned').length, 1);
});

test('guard survives storage failure via URL and suppresses reload, hidden documents, and history restoration', () => {
  const h = harness({ storageFails: true });
  const target = h.controller.claimAutomatic(); assert.ok(target.includes('_lp_handoff=1#links'));
  assert.equal(h.controller.claimAutomatic(), null);
  assert.equal(harness({ href: target, storageFails: true }).controller.claimAutomatic(), null);
  assert.equal(harness({ storageFails: true, historyFails: true }).controller.claimAutomatic(), null);
  const hidden = harness(); hidden.doc.visibilityState = 'hidden'; assert.equal(hidden.controller.claimAutomatic(), null);
  const restored = harness(); restored.win.performance = { getEntriesByType: () => [{ type: 'back_forward' }] }; assert.equal(restored.controller.claimAutomatic(), null);
  const framed = harness(); framed.win.top = {}; assert.equal(framed.controller.claimAutomatic(), null);
});

test('launch error offers fallback, telemetry exceptions cannot block navigation', () => {
  const h = harness(); h.controller.destroy();
  const controller = createHandoffController({ ...h.options, launch() { throw Error('blocked'); }, track() { throw Error('analytics unavailable'); } });
  assert.equal(controller.attempt(plan), true);
  assert.equal(controller.active.state, 'fallback_visible');
  controller.destroy();
});

test('a different target during a pending handoff can continue directly, without a second launch', () => {
  const h = harness(); h.controller.attempt(plan);
  const next = openingPlan('https://example.com/other', { mode: 'native' }, ios);
  assert.equal(h.controller.attempt(next), false);
  assert.equal(h.launches.length, 1);
});

test('an explicit tap supersedes a pending arrival attempt without a direct-navigation race', () => {
  for (const trigger of ['cta', 'manual']) {
    const h = harness(); h.controller.destroy();
    const pending = [], cleaned = [], launched = [];
    const win = Object.assign(h.win, {
      setTimeout(callback) { pending.push(callback); return pending.length; },
      clearTimeout() {}, // Deliberately retain stale callbacks to test their identity guard.
    });
    const controller = createHandoffController({ ...h.options, window: win,
      launch(plan, reason) { launched.push({ plan, reason }); return () => cleaned.push(plan.target); },
    });
    const target = controller.claimAutomatic();
    const arrival = openingPlan(target.split('#')[0], { mode: 'native', androidAutoOpen: true }, android, { automatic: true });
    const destination = trigger === 'cta' ? 'https://example.com/example/more-soon/' : arrival.target;
    const explicit = openingPlan(destination, { mode: 'native' }, android);
    controller.attempt(arrival, { id: 'page', trigger: 'automatic' });
    assert.equal(controller.attempt(explicit, { id: 'projects', trigger }), true);
    assert.equal(launched.length, 2);
    assert.equal(launched[1].reason, trigger);
    assert.equal(controller.active.plan.target, destination);
    assert.deepEqual(cleaned, [arrival.target]);
    pending[0]();
    assert.equal(controller.active.state, 'attempted');
    assert.equal(controller.attempt(explicit, { id: 'projects', trigger }), true);
    assert.equal(launched.length, 2);
    pending[1]();
    assert.equal(controller.active.state, 'fallback_visible');
    assert.equal(controller.claimAutomatic(), null);
    win.dispatchEvent(new Event('pageshow'));
    assert.equal(launched.length, 2);
    controller.destroy();
  }
});

test('a hidden arrival attempt cannot be superseded until the page returns', () => {
  const h = harness();
  h.controller.attempt(plan, { trigger: 'automatic' });
  h.visibility('hidden');
  const next = openingPlan('https://example.com/other', { mode: 'native' }, ios);
  assert.equal(h.controller.attempt(next, { trigger: 'cta' }), false);
  assert.equal(h.launches.length, 1);
  h.visibility('visible');
  assert.equal(h.launches.length, 1);
  assert.equal(h.controller.attempt(next, { trigger: 'cta' }), true);
  assert.equal(h.launches.length, 2);
});
