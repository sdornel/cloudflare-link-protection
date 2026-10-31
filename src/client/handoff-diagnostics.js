import { eventDetail } from './analytics.js';

const KEY = 'profile:handoff-diagnostics';
const LIMIT = 40;

// Explicit, local-only troubleshooting for the public example. No provider,
// network calls, destinations, raw UA or private profile options are recorded.
export function initializeHandoffDiagnostics(win, context) {
  if (!/^\/example(?:\/|\/index\.html)?$/.test(win.location.pathname)) return;
  const flag = new URL(win.location.href).searchParams.get('handoff_debug');
  let saved;
  try {
    if (flag === '0') { win.sessionStorage.removeItem(KEY); return; }
    const raw = win.sessionStorage.getItem(KEY);
    if (raw && raw.length < 20000) saved = JSON.parse(raw);
  } catch {}
  if (flag === '0' || (flag !== '1' && saved?.enabled !== true)) return;
  const rows = Array.isArray(saved?.rows) ? saved.rows.filter(row => typeof row === 'string' && row.length <= 400).slice(-LIMIT) : [];
  const doc = win.document;
  const details = doc.createElement('details'); details.className = 'notice'; details.open = true;
  const summary = doc.createElement('summary'); summary.textContent = 'Browser diagnostics (local to this tab)';
  const report = doc.createElement('textarea'); report.readOnly = true; report.rows = 12; report.cols = 30;
  report.setAttribute('aria-label', 'Browser diagnostic report');
  const select = doc.createElement('button'); select.type = 'button'; select.className = 'quiet-button'; select.textContent = 'Select report';
  select.addEventListener('click', () => { report.focus(); report.select(); });
  details.append(summary, report, select);
  (doc.querySelector('main') || doc.body).append(details);
  const build = import.meta.url.match(/\/assets\/([a-f0-9]{12})\//)?.[1] || 'local';
  const record = message => {
    try {
      const visibility = doc.visibilityState === 'visible' ? 'visible' : 'hidden';
      const activation = win.navigator.userActivation;
      const gesture = activation ? String(activation.isActive) : 'unknown';
      rows.push(`${new Date().toISOString().slice(11, 23)} ${message} visible=${visibility} gesture=${gesture}`);
      if (rows.length > LIMIT) rows.shift();
      report.value = rows.join('\n');
      try { win.sessionStorage.setItem(KEY, JSON.stringify({ enabled: true, rows })); } catch {}
    } catch { /* Diagnostics must never change navigation. */ }
  };
  const analytics = event => {
    const clean = eventDetail(event.detail?.name, event.detail || {});
    if (clean) record(Object.values(clean).join(' '));
  };
  const tap = event => {
    const anchor = event.target?.closest?.('a[data-opening-mode], #handoff-direct');
    if (!anchor) return;
    record(`tap ${anchor.id === 'handoff-direct' ? 'direct-fallback' : 'cta'} trusted=${Boolean(event.isTrusted)}`);
  };
  const hide = () => record('pagehide');
  const show = () => record('pageshow');
  const visibility = () => record('visibilitychange');
  win.addEventListener('profile:analytics', analytics);
  doc.addEventListener('click', tap, true);
  win.addEventListener('pagehide', hide);
  win.addEventListener('pageshow', show);
  doc.addEventListener('visibilitychange', visibility);
  const platform = ['ios', 'android'].includes(context.platform) ? context.platform : 'other';
  record(`ready build=${build} ${platform} ${context.instagram ? 'instagram' : context.facebook ? 'facebook' : 'other'}`);
  return { destroy() {
    win.removeEventListener('profile:analytics', analytics);
    doc.removeEventListener('click', tap, true);
    win.removeEventListener('pagehide', hide);
    win.removeEventListener('pageshow', show);
    doc.removeEventListener('visibilitychange', visibility);
    details.remove();
  } };
}
