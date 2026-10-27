export function createAgeAcknowledgment({ window: win, document: doc, options, track = () => {}, onAccepted = () => {} }) {
  const section = doc.getElementById('age-notice');
  let accepted = !options.enabled, pending = null;
  if (options.enabled && options.remember === 'session') { try { accepted = win.sessionStorage.getItem('profile:age-acknowledged') === '1'; } catch {} }
  const button = doc.getElementById('age-accept');
  const status = doc.getElementById('age-status');
  if (section && button) {
    button.hidden = accepted;
    if (accepted) status.textContent = 'Age acknowledged for this session.';
    button.addEventListener('click', () => {
      if (accepted) return;
      accepted = true;
      if (options.remember === 'session') { try { win.sessionStorage.setItem('profile:age-acknowledged', '1'); } catch {} }
      button.hidden = true; status.textContent = 'Age acknowledged.';
      doc.getElementById('links')?.focus();
      try { track('age_acknowledged'); } catch {}
      const action = pending; pending = null;
      if (action) action();
      else onAccepted();
    });
  }
  return {
    get accepted() { return accepted; },
    request(action) {
      if (accepted || !button) return false;
      pending = action;
      status.textContent = 'Please acknowledge your age to continue.';
      button.hidden = false; button.focus();
      return true;
    },
  };
}
