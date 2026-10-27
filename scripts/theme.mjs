const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function merge(base, patch) {
  if (!object(patch)) throw new Error('Style overrides must be objects.');
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (forbiddenKeys.has(key)) throw new Error('Unsupported style key.');
    if (value === null) delete result[key];
    else result[key] = object(value) ? merge(object(base?.[key]) ? base[key] : {}, value) : value;
  }
  return result;
}

function value(text) {
  if (typeof text !== 'string' || !text.trim() || /[{};<>\\\x00-\x1f]/.test(text)
      || /\/\*|\*\/|@|url\s*\(|image(?:-set)?\s*\(|expression\s*\(/i.test(text)) {
    throw new Error('Style values must be single CSS values without imports, URLs, comments, or statement delimiters.');
  }
  return text;
}

function declarations(properties) {
  if (!object(properties)) throw new Error('Each CSS rule must be an object of properties.');
  return Object.entries(properties).map(([property, text]) => {
    if (!/^(?:--)?[a-z][a-z0-9-]*$/.test(property) && !/^-[a-z][a-z0-9-]*$/.test(property)) throw new Error('CSS property names must use lowercase kebab-case.');
    if (/^(?:behavior|-moz-binding)$/.test(property)) throw new Error('Unsupported CSS property.');
    return `  ${property}: ${value(text)};`;
  }).join('\n');
}

function rules(entries = {}, keyframes = false) {
  if (!object(entries)) throw new Error('Style rules must be an object.');
  return Object.entries(entries).map(([selector, properties]) => {
    if (!selector.trim() || /[{};@\\\x00-\x1f]|\/\*|\*\//.test(selector)) throw new Error('Invalid CSS selector.');
    if (keyframes && !/^(?:from|to|\d+(?:\.\d+)?%)(?:,\s*(?:from|to|\d+(?:\.\d+)?%))*$/.test(selector)) throw new Error('Invalid animation keyframe selector.');
    return `${selector} {\n${declarations(properties)}\n}`;
  }).join('\n\n');
}

export function compileTheme(base, overrides = {}) {
  const theme = merge(base, overrides);
  if (Object.keys(theme).some((key) => !['variables', 'rules', 'media', 'keyframes'].includes(key))) throw new Error('Theme supports variables, rules, media, and keyframes.');
  if (!object(theme.variables)) throw new Error('Theme variables must be an object.');
  const vars = Object.fromEntries(Object.entries(theme.variables).map(([key, text]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error('Theme variable names must use lowercase kebab-case.');
    return [`--${key}`, text];
  }));
  const css = [`:root {\n${declarations(vars)}\n}`, rules(theme.rules)];
  if (!object(theme.media ?? {}) || !object(theme.keyframes ?? {})) throw new Error('Media queries and keyframes must be objects.');
  for (const [query, entries] of Object.entries(theme.media ?? {})) {
    if (!/^[a-zA-Z0-9():.,\s\-/]+$/.test(query) || /[\r\n]|\/\*|\*\//.test(query)) throw new Error('Invalid CSS media query.');
    css.push(`@media ${query} {\n${rules(entries)}\n}`);
  }
  for (const [name, entries] of Object.entries(theme.keyframes ?? {})) {
    if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new Error('Invalid animation name.');
    css.push(`@keyframes ${name} {\n${rules(entries, true)}\n}`);
  }
  return `${css.join('\n\n')}\n`;
}
