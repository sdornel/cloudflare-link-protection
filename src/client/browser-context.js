// Detection is only a navigation hint, never an access or content decision.
export function browserContext({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const instagram = /\bInstagram\b/i.test(userAgent);
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  const os = ios ? 'ios' : android ? 'android' : 'other';
  return { instagram, platform: os, eligible: instagram && os !== 'other' };
}
