'use strict';

const DEFAULT_SEARCH_TEMPLATE = 'https://www.google.com/search?q=%s';
const SAFE_SCHEMES = new Set(['http:', 'https:', 'file:', 'longview:', 'about:']);

function looksLikeHost(input) {
  const value = input.trim();
  if (!value || /\s/.test(value)) return false;
  if (/^localhost(?::\d+)?(?:\/|$)/i.test(value)) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(value)) return true;
  if (/^\[[0-9a-f:]+\](?::\d+)?(?:\/|$)/i.test(value)) return true;
  return /^[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?(?::\d+)?(?:\/.*)?$/u.test(value) && value.includes('.');
}

function applySearchTemplate(template, query) {
  const encoded = encodeURIComponent(query);
  return (template || DEFAULT_SEARCH_TEMPLATE).includes('%s')
    ? (template || DEFAULT_SEARCH_TEMPLATE).replace('%s', encoded)
    : `${template || DEFAULT_SEARCH_TEMPLATE}${encoded}`;
}

function normalizeNavigationInput(input, options = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) return 'longview://newtab/';

  if (/^javascript:/i.test(raw) || /^data:/i.test(raw)) {
    return applySearchTemplate(options.searchTemplate, raw);
  }

  if (looksLikeHost(raw)) {
    const protocol = /^localhost(?::|\/|$)/i.test(raw) || /^(?:\d{1,3}\.){3}\d{1,3}/.test(raw)
      ? 'http://'
      : 'https://';
    try {
      return new URL(`${protocol}${raw}`).href;
    } catch {
      return applySearchTemplate(options.searchTemplate, raw);
    }
  }

  try {
    const parsed = new URL(raw);
    if (SAFE_SCHEMES.has(parsed.protocol)) return parsed.href;
    return applySearchTemplate(options.searchTemplate, raw);
  } catch {
    // Continue with search handling.
  }

  return applySearchTemplate(options.searchTemplate, raw);
}

function isWebNavigation(url) {
  try {
    const parsed = new URL(url);
    return SAFE_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isInternalUrl(url) {
  try {
    return new URL(url).protocol === 'longview:';
  } catch {
    return false;
  }
}

function displayUrl(url) {
  if (!url) return '';
  if (url === 'longview://newtab/' || url === 'longview://newtab') return '';
  return url;
}

module.exports = {
  DEFAULT_SEARCH_TEMPLATE,
  SAFE_SCHEMES,
  applySearchTemplate,
  displayUrl,
  isInternalUrl,
  isWebNavigation,
  looksLikeHost,
  normalizeNavigationInput
};
