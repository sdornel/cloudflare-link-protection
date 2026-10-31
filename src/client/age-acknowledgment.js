export function createAgeAcknowledgment({ window: win, document: doc, options, track = () => {}, onAccepted = () => {} }) {
  const section = doc.getElementById('age-notice');
  const primaryOnly = options.scope === 'primary';
  const profilePath = (win.location?.pathname || '/').replace(/\/index(?:\.html)?$/, '/').replace(/\/+$/, '') || '/';
  const storageKey = primaryOnly ? `profile:age-acknowledged:primary:${profilePath}:${options.primaryLinkId}` : 'profile:age-acknowledged';
  let accepted = !options.enabled, pending = null, returnFocus = null;
  if (options.enabled && options.remember === 'session') { try { accepted = win.sessionStorage.getItem(storageKey) === '1'; } catch {} }
  const button = doc.getElementById('age-accept');
  const status = doc.getElementById('age-status');
  const allows = (linkId) => accepted || (primaryOnly && linkId !== options.primaryLinkId);
  const closePrompt = () => {
    if (section.open && typeof section.close === 'function') section.close();
    else section.removeAttribute('open');
    returnFocus?.focus();
    returnFocus = null;
  };
  if (section && button) {
    button.hidden = accepted;
    if (accepted) status.textContent = 'Age acknowledged for this session.';
    button.addEventListener('click', () => {
      if (accepted || (primaryOnly && !pending)) return;
      accepted = true;
      if (options.remember === 'session') { try { win.sessionStorage.setItem(storageKey, '1'); } catch {} }
      button.hidden = true; status.textContent = 'Age acknowledged.';
      if (primaryOnly) closePrompt();
      else doc.getElementById('links')?.focus();
      try { track('age_acknowledged'); } catch {}
      const action = pending; pending = null;
      if (action) action();
      else onAccepted();
    });
    if (primaryOnly) {
      const cancel = () => { pending = null; closePrompt(); };
      doc.getElementById('age-cancel')?.addEventListener('click', cancel);
      section.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    }
  }
  return {
    get accepted() { return accepted; },
    allows,
    request(action, linkId, trigger) {
      if (allows(linkId) || !section || !button) return false;
      pending = action;
      if (primaryOnly) {
        returnFocus = trigger || doc.activeElement;
        if (!section.open) {
          try { section.showModal(); } catch {
            // Older webviews can show the same confirmation inline.
            section.setAttribute('data-inline', '');
            section.setAttribute('open', '');
          }
        }
      } else status.textContent = 'Please acknowledge your age to continue.';
      button.hidden = false; button.focus();
      return true;
    },
  };
}
