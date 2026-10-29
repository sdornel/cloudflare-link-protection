const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding.');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
}
const key = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signCookie(payload, secret) {
  const data = encode(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(data)));
  return `${data}.${encode(signature)}`;
}

export async function readSignedCookie(value, secret, { kind, origin, profilePath, now, maxAge }) {
  try {
    if (!value || value.length > 2048) return null;
    const parts = value.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(decoder.decode(decode(parts[0])));
    if (payload.v !== 1 || payload.kind !== kind || payload.origin !== origin || payload.profilePath !== profilePath ||
        !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > now ||
        payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > maxAge) return null;
    if (kind === 'challenge' && !/^[a-f0-9]{32}$/.test(payload.nonce)) return null;
    return payload;
  } catch { return null; }
}

export function getCookie(request, name) {
  const values = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  // Duplicate names are ambiguous. Do not accept a less-specific injected cookie.
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}

export const cookieHeader = (name, value, seconds) => `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
export const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
