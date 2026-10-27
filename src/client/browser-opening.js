export const HANDOFF_MARKER = '_lp_handoff';
export const SESSION_GUARD = 'profile:handoff-attempted';

export function isHTTPS(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

// Append without URLSearchParams serialization, which can change signed query bytes.
export function guardedPageURL(value) {
  if (!isHTTPS(value)) return null;
  const url = new URL(value);
  if (url.searchParams.has(HANDOFF_MARKER)) return { url: value, marked: true };
  const hashAt = value.indexOf('#');
  const main = hashAt < 0 ? value : value.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : value.slice(hashAt);
  const separator = main.includes('?') ? (/[?&]$/.test(main) ? '' : '&') : '?';
  return { url: `${main}${separator}${HANDOFF_MARKER}=1${fragment}`, marked: false };
}

export function openingPlan(target, { mode = 'direct', iosStrategy = 'instagram', androidPackage = 'com.android.chrome' } = {}, context = {}, { automatic = false } = {}) {
  const direct = (reason) => ({ strategy: 'direct', target, fallback: target, reason });
  if (!isHTTPS(target)) return direct('invalid_url');
  if (mode !== 'native' || !context.eligible) return direct('ordinary_navigation');
  if (context.platform === 'ios') {
    if (iosStrategy === 'instagram') return { strategy: 'ios-instagram', target, fallback: target, uri: `instagram://extbrowser/?url=${encodeURIComponent(target)}`, automatic };
    if (iosStrategy === 'safari') return { strategy: 'ios-safari', target, fallback: target, uri: `x-safari-https://${target.slice(8)}`, automatic };
    return direct('unsupported_strategy');
  }
  if (context.platform === 'android') {
    if (automatic) return direct('gesture_required');
    // Do not silently discard fragments or risk ambiguous intent URI parsing.
    if (/[#;]/.test(target)) return direct('intent_url_unsupported');
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(androidPackage)) return direct('invalid_package');
    return {
      strategy: 'android-intent', target, fallback: target,
      uri: `intent://${target.slice(8)}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(target)};end`,
    };
  }
  return direct('unsupported_context');
}

export function isPlainActivation(event, anchor) {
  return !event.defaultPrevented && (event.button === undefined || event.button === 0)
    && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && !anchor.hasAttribute('download') && (!anchor.target || anchor.target === '_self');
}
