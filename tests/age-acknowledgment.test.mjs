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
