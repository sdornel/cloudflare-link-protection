import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgeAcknowledgment } from '../src/client/age-acknowledgment.js';
function setup({ enabled = true, remember = 'session', stored = '', unavailable = false } = {}) {
  const button = new EventTarget(); button.focus = () => button.focused = true;
  const status = {}; const links = { focus() { this.focused = true; } };
  const elements = { 'age-notice': {}, 'age-accept': button, 'age-status': status, links };
  let saved;
  const window = { sessionStorage: { getItem() { if (unavailable) throw Error(); return stored; }, setItem(key, value) { if (unavailable) throw Error(); saved = value; } } };
  const gate = createAgeAcknowledgment({ window, document: { getElementById: id => elements[id] }, options: { enabled, remember } });
  return { gate, button, status, links, get saved() { return saved; } };
}
test('acknowledgment resumes the selected action once even when storage is unavailable', () => {
  const h = setup({ unavailable: true }); let count = 0;
  assert.equal(h.gate.request(() => count++), true); assert.equal(h.button.focused, true);
  h.button.dispatchEvent(new Event('click')); h.button.dispatchEvent(new Event('click'));
  assert.equal(count, 1); assert.equal(h.gate.accepted, true); assert.equal(h.links.focused, true);
  assert.equal(h.gate.request(() => count++), false);
});
test('disabled, remembered and nonremembered modes preserve direct behavior and minimal stored state', () => {
  assert.equal(setup({ enabled: false }).gate.request(() => {}), false);
  assert.equal(setup({ stored: '1' }).gate.accepted, true);
  const fresh = setup({ stored: '1', remember: 'none' }); assert.equal(fresh.gate.accepted, false);
  fresh.button.dispatchEvent(new Event('click')); assert.equal(fresh.saved, undefined);
  const saved = setup(); saved.button.dispatchEvent(new Event('click')); assert.equal(saved.saved, '1');
});

function primarySetup({ storage = new Map(), pathname = '/sample-creator/', linkId = 'exclusive', remember = 'session', unavailable = false, modal = true } = {}) {
  const dialog = new EventTarget(); dialog.open = false;
  dialog.setAttribute = (key) => { if (key === 'open') dialog.open = true; };
  dialog.removeAttribute = (key) => { if (key === 'open') dialog.open = false; };
  if (modal) dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const accept = new EventTarget(), cancel = new EventTarget();
  accept.focus = () => { accept.focused = true; };
  const trigger = { focus() { this.focused = true; } };
  const elements = { 'age-notice': dialog, 'age-accept': accept, 'age-cancel': cancel, 'age-status': {} };
  const gate = createAgeAcknowledgment({
    window: { location: { pathname }, get sessionStorage() {
      if (unavailable) throw new Error('Blocked storage');
      return { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    } },
    document: { getElementById: id => elements[id], activeElement: trigger },
    options: { enabled: true, scope: 'primary', primaryLinkId: linkId, remember },
  });
  return { gate, dialog, accept, cancel, trigger, storage };
}

test('primary acknowledgment waits for its CTA and never gates secondary links or page handoffs', () => {
  const h = primarySetup();
  assert.equal(h.dialog.open, false);
  assert.equal(h.gate.allows(), true);
  assert.equal(h.gate.request(() => {}, 'secondary'), false);
  assert.equal(h.gate.allows('exclusive'), false);
  let calls = 0;
  assert.equal(h.gate.request(() => calls++, 'exclusive', h.trigger), true);
  assert.equal(h.dialog.open, true);
  assert.equal(h.accept.focused, true);
  assert.equal(calls, 0);
  h.accept.dispatchEvent(new Event('click'));
  h.accept.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  assert.equal(h.dialog.open, false);
  assert.equal(h.gate.request(() => calls++, 'exclusive'), false);
  assert.deepEqual([...h.storage.values()], ['1']);
});

for (const dismissal of ['button', 'escape']) {
  test(`primary ${dismissal} cancellation restores focus, stores nothing, and discards the pending destination`, () => {
    const h = primarySetup(); let first = 0, next = 0;
    h.gate.request(() => first++, 'exclusive', h.trigger);
    if (dismissal === 'button') h.cancel.dispatchEvent(new Event('click'));
    else h.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert.equal(h.dialog.open, false);
    assert.equal(h.trigger.focused, true);
    assert.equal(h.storage.size, 0);
    assert.equal(h.gate.accepted, false);
    h.accept.dispatchEvent(new Event('click'));
    assert.equal(first, 0);
    h.gate.request(() => next++, 'exclusive', h.trigger);
    h.accept.dispatchEvent(new Event('click'));
    assert.equal(first, 0);
    assert.equal(next, 1);
  });
}

test('primary session acknowledgment survives reload and aliases but does not authorize another profile or link', () => {
  const h = primarySetup();
  h.gate.request(() => {}, 'exclusive'); h.accept.dispatchEvent(new Event('click'));
  for (const pathname of ['/sample-creator', '/sample-creator/', '/sample-creator/index', '/sample-creator/index.html']) {
    assert.equal(primarySetup({ storage: h.storage, pathname }).gate.accepted, true);
  }
  assert.equal(primarySetup({ storage: h.storage, pathname: '/other-profile/' }).gate.accepted, false);
  assert.equal(primarySetup({ storage: h.storage, linkId: 'different' }).gate.accepted, false);
  assert.equal(primarySetup().gate.accepted, false);
  assert.equal(primarySetup({ storage: new Map([['profile:age-acknowledged', '1']]) }).gate.accepted, false);
});

for (const settings of [{ unavailable: true }, { remember: 'none' }]) {
  test(`primary acknowledgment stays document-only with ${JSON.stringify(settings)}`, () => {
    const h = primarySetup(settings); let calls = 0;
    h.gate.request(() => calls++, 'exclusive'); h.accept.dispatchEvent(new Event('click'));
    assert.equal(calls, 1);
    assert.equal(h.gate.request(() => calls++, 'exclusive'), false);
    assert.equal(h.storage.size, 0);
    assert.equal(primarySetup(settings).gate.accepted, false);
  });
}

test('primary confirmation remains usable inline when a webview has no modal API', () => {
  const h = primarySetup({ modal: false }); let calls = 0;
  h.gate.request(() => calls++, 'exclusive');
  assert.equal(h.dialog.open, true);
  h.accept.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  assert.equal(h.dialog.open, false);
});
