const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const labels = {
  open: 'Open in Browser', retry: 'Try again', continue: 'Continue here', dismiss: 'Dismiss',
  pending: 'Your browser may ask you to confirm opening this link.',
  unconfirmed: 'Still here? You can continue here or try opening your browser again.',
  iosInstructions: 'You can also use the app’s menu to open this page in your browser.',
  androidInstructions: 'You can also use the app’s menu and choose Open in browser.',
};
const choice = (value, values, field) => { if (!values.includes(value)) throw new Error(`${field} has an unsupported value.`); };
const boolean = (value, field) => { if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`); };

export function normalizeFeatures(config) {
  if (!object(config)) throw new Error('Configuration must be an object.');
  for (const key of ['browserOpening', 'ageAcknowledgment', 'analytics']) {
    if (config[key] !== undefined && !object(config[key])) throw new Error(`${key} must be an object.`);
  }
  const version = config.schemaVersion === undefined ? 1 : config.schemaVersion;
  choice(version, [1, 2], 'schemaVersion');
  const input = config.browserOpening ?? {};
  if (input.labels !== undefined && !object(input.labels)) throw new Error('browserOpening.labels must be an object.');
  const browserOpening = {
    mode: 'direct', autoOpen: false, showManual: true, iosStrategy: 'instagram',
    androidPackage: 'com.android.chrome', fallbackDelayMs: 1800, ...input,
    labels: { ...labels, ...input.labels },
  };
  choice(browserOpening.mode, ['native', 'direct'], 'browserOpening.mode');
  choice(browserOpening.iosStrategy, ['instagram', 'safari'], 'browserOpening.iosStrategy');
  for (const field of ['autoOpen', 'showManual']) boolean(browserOpening[field], `browserOpening.${field}`);
  if (!Number.isInteger(browserOpening.fallbackDelayMs) || browserOpening.fallbackDelayMs < 800 || browserOpening.fallbackDelayMs > 5000) throw new Error('browserOpening.fallbackDelayMs must be an integer from 800 to 5000.');
  if (typeof browserOpening.androidPackage !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(browserOpening.androidPackage)) throw new Error('browserOpening.androidPackage must be an Android package name.');
  for (const [key, text] of Object.entries(browserOpening.labels)) {
    if (!Object.hasOwn(labels, key) || typeof text !== 'string' || !text.trim() || text.length > 500) throw new Error('browserOpening.labels requires supported keys and nonempty text of at most 500 characters.');
  }
  const ageAcknowledgment = { enabled: false, message: 'These links are intended for adults aged 18 or older.', remember: 'session', ...config.ageAcknowledgment };
  boolean(ageAcknowledgment.enabled, 'ageAcknowledgment.enabled');
  choice(ageAcknowledgment.remember, ['session', 'none'], 'ageAcknowledgment.remember');
  if (typeof ageAcknowledgment.message !== 'string' || !ageAcknowledgment.message.trim() || ageAcknowledgment.message.length > 500) throw new Error('ageAcknowledgment.message must be nonempty text of at most 500 characters.');
  const analytics = { ga4MeasurementId: '', ga4Consent: 'required', debug: false, ...config.analytics };
  if (typeof analytics.ga4MeasurementId !== 'string' || (analytics.ga4MeasurementId && !/^G-[A-Z0-9]{4,20}$/.test(analytics.ga4MeasurementId))) throw new Error('analytics.ga4MeasurementId must be empty or a GA4 G- identifier.');
  choice(analytics.ga4Consent, ['required', 'granted'], 'analytics.ga4Consent');
  boolean(analytics.debug, 'analytics.debug');
  const ids = new Set();
  const link = (entry, id) => {
    if (!object(entry)) throw new Error('Links must be objects.');
    const result = { ...entry, id: entry.id === undefined ? id : entry.id, openingMode: entry.openingMode === undefined ? 'inherit' : entry.openingMode };
    if (typeof result.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(result.id) || ids.has(result.id)) throw new Error('Link IDs must be unique, lowercase letters, digits, underscores or hyphens (1–40 characters).');
    ids.add(result.id);
    choice(result.openingMode, ['inherit', 'direct', 'native'], 'link.openingMode');
    return result;
  };
  if (!Array.isArray(config.secondaryLinks)) throw new Error('secondaryLinks must be an array.');
  return { ...config, schemaVersion: version, browserOpening, ageAcknowledgment, analytics,
    primaryLink: link(config.primaryLink, 'primary'), secondaryLinks: config.secondaryLinks.map((entry, i) => link(entry, `secondary-${i + 1}`)) };
}

// Explicit allowlist: extra operator metadata is never sent to a visitor.
export function publicOptions(config) {
  const b = config.browserOpening, a = config.ageAcknowledgment;
  return {
    browserOpening: { mode: b.mode, autoOpen: b.autoOpen, showManual: b.showManual, iosStrategy: b.iosStrategy, androidPackage: b.androidPackage, fallbackDelayMs: b.fallbackDelayMs, labels: Object.fromEntries(Object.keys(labels).map((key) => [key, b.labels[key]])) },
    ageAcknowledgment: { enabled: a.enabled, remember: a.remember },
    analytics: { ga4MeasurementId: config.analytics.ga4MeasurementId, ga4Consent: config.analytics.ga4Consent, debug: config.analytics.debug },
  };
}
