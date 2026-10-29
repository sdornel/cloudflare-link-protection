export const verificationCopy = Object.freeze({
  heading: 'A quick check before continuing',
  description: 'Please complete the security check to open this page.',
  footer: 'Thanks for taking a moment to stop automated traffic.',
  loading: 'Loading the security check…',
  verifying: 'Checking…',
  error: 'We could not verify this visit. Please try again.',
  expired: 'The check expired or cookies are unavailable. Allow cookies and try again.',
  unavailable: 'The security check is temporarily unavailable. Try again shortly, or open this link in your browser.',
  noScript: 'This page needs JavaScript for the security check. Enable it and reload, or open this link in your browser.',
  retry: 'Try again',
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeVerification(value = {}) {
  if (!object(value)) throw new Error('verification must be an object.');
  if (Object.keys(value).some(key => !['enabled', 'sessionMinutes', 'widgetTheme', 'copy', 'styles'].includes(key))) {
    throw new Error('verification contains an unsupported field. Keep credentials in Worker runtime settings.');
  }
  const result = { enabled: false, sessionMinutes: 60, widgetTheme: 'auto', ...value };
  if (typeof result.enabled !== 'boolean') throw new Error('verification.enabled must be true or false.');
  if (!Number.isInteger(result.sessionMinutes) || result.sessionMinutes < 5 || result.sessionMinutes > 1440) {
    throw new Error('verification.sessionMinutes must be an integer from 5 to 1440.');
  }
  if (!['auto', 'light', 'dark'].includes(result.widgetTheme)) throw new Error('verification.widgetTheme must be auto, light, or dark.');
  if (!object(value.copy === undefined ? {} : value.copy)) throw new Error('verification.copy must be an object.');
  for (const [key, text] of Object.entries(value.copy ?? {})) {
    if (!Object.hasOwn(verificationCopy, key) || typeof text !== 'string' || !text.trim() || text.length > 500) {
      throw new Error('verification.copy must contain supported nonempty text fields of at most 500 characters.');
    }
  }
  result.copy = { ...verificationCopy, ...value.copy };
  result.styles = value.styles === undefined ? {} : value.styles;
  if (!object(result.styles)) throw new Error('verification.styles must be an object.');
  return result;
}
