import { guardedPageURL, SESSION_GUARD } from './browser-opening.js';

// Browser effects are injected so timers, cancellations and returns can be tested.
export function createHandoffController({ window: win, document: doc, delay = 1800, track = () => {}, onState = () => {}, launch }) {
  let active = null, autoClaimed = false;
  const emit = (name, detail) => { try { track(name, detail); } catch {} };
  const show = (state, attempt) => { try { onState(state, attempt); } catch {} };
  const clear = () => {
    if (!active) return;
    win.clearTimeout(active.timer);
    active.cleanup?.();
    active.cleanup = null;
  };
  const defaultLaunch = (plan, trigger) => {
    if (trigger === 'automatic' && plan.strategy === 'ios-instagram') {
      const refresh = doc.createElement('meta');
      refresh.httpEquiv = 'refresh';
      refresh.content = `0;url=${plan.uri}`;
      doc.head.append(refresh);
      return () => refresh.remove();
    }
    win.location.assign(plan.uri);
    return () => {};
  };
  const detail = (attempt) => ({ link_id: attempt.id, strategy: attempt.plan.strategy, trigger: attempt.trigger });
  const fallback = (reason) => {
    if (!active) return;
    clear();
    active.state = 'fallback_visible';
    emit('fallback_shown', { ...detail(active), reason });
    show('fallback_visible', active);
  };
  function attempt(plan, { id = 'page', trigger = 'manual' } = {}) {
    if (plan.strategy === 'direct' || !plan.uri) return false;
    if (active && ['attempted', 'page_hidden_observed'].includes(active.state)) return active.plan.target === plan.target;
    clear();
    autoClaimed = true;
    active = { plan, id, trigger, state: 'attempted', cleanup: null, timer: null };
    emit('handoff_attempt', detail(active));
    show('attempted', active);
    const current = active;
    try {
      current.timer = win.setTimeout(() => {
        if (active !== current || current.state !== 'attempted') return;
        if (doc.visibilityState === 'hidden') { hidden(); return; }
        emit('handoff_unconfirmed', detail(current));
        fallback('unconfirmed');
      }, delay);
      current.cleanup = (launch ?? defaultLaunch)(plan, trigger);
      // A synchronous test/browser event may have already hidden the document.
      if (current.state !== 'attempted') { current.cleanup?.(); current.cleanup = null; }
    } catch { fallback('launch_error'); }
    return true;
  }
  function hidden() {
    if (!active || active.state !== 'attempted') return;
    clear();
    active.state = 'page_hidden_observed';
    emit('handoff_page_hidden', detail(active));
    show('page_hidden_observed', active);
  }
  function returned() {
    if (!active || active.state !== 'page_hidden_observed') return;
    emit('handoff_returned', detail(active));
    fallback('returned');
  }
  const visibility = () => doc.visibilityState === 'hidden' ? hidden() : returned();
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('pagehide', hidden);
  win.addEventListener('pageshow', returned);

  function claimAutomatic() {
    if (autoClaimed || doc.visibilityState !== 'visible' || doc.prerendering) return null;
    try { if (win.top !== win.self || win.performance?.getEntriesByType('navigation')[0]?.type === 'back_forward') return null; } catch { return null; }
    const guarded = guardedPageURL(win.location.href);
    if (!guarded || guarded.marked) return null;
    try { if (win.sessionStorage.getItem(SESSION_GUARD)) return null; } catch {}
    let persisted = false;
    try { win.sessionStorage.setItem(SESSION_GUARD, '1'); persisted = true; } catch {}
    try { win.history.replaceState(win.history.state, '', guarded.url); persisted = true; } catch {}
    autoClaimed = true;
    // Without a durable guard a reload could repeatedly launch a scheme.
    return persisted ? guarded.url : null;
  }
  const dismiss = () => { clear(); active = null; show('idle'); };
  return {
    attempt, claimAutomatic, dismiss,
    get active() { return active; },
    destroy() {
      dismiss(); doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('pagehide', hidden); win.removeEventListener('pageshow', returned);
    },
  };
}
