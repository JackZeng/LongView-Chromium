'use strict';

function uniqueElements(elements) {
  const seen = new Set();
  const output = [];
  for (const element of elements) {
    if (!element || seen.has(element)) continue;
    seen.add(element);
    output.push(element);
  }
  return output;
}

function isElementEligible(element) {
  if (!(element instanceof Element)) return false;
  if (!element.isConnected) return false;
  if (['HTML', 'BODY', 'MAIN'].includes(element.tagName)) return false;
  if (element.closest('[contenteditable="true"]')) return false;
  const unsafeSelector = 'dialog, [popover], video, audio, canvas, iframe, object, embed, [contenteditable="true"]';
  if (element.matches(unsafeSelector) || element.querySelector(unsafeSelector)) return false;

  const style = getComputedStyle(element);
  if (style.position === 'fixed' || style.position === 'sticky') return false;
  if (style.display === 'inline' || style.display === 'contents' || style.display === 'none') return false;

  const rect = element.getBoundingClientRect();
  return rect.width >= 160 && rect.height >= 48;
}

function findScrollRoot(documentObject) {
  const document = documentObject || globalThis.document;
  const scrollingElement = document.scrollingElement || document.documentElement;
  let best = scrollingElement;
  let bestScore = Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);

  for (const element of document.querySelectorAll('main, [role="main"], [role="feed"], [data-scroll-container], .overflow-y-auto')) {
    const style = getComputedStyle(element);
    if (!/(auto|scroll)/.test(style.overflowY)) continue;
    const score = Math.max(0, element.scrollHeight - element.clientHeight);
    if (score > bestScore && element.clientHeight > 200) {
      best = element;
      bestScore = score;
    }
  }
  return best;
}

function discoverExplicitSegments(document) {
  return uniqueElements([...document.querySelectorAll('[data-longview-segment]')]).filter(isElementEligible);
}

function discoverChatSegments(document) {
  const markers = [
    ...document.querySelectorAll('[data-message-author-role]'),
    ...document.querySelectorAll('[data-testid^="conversation-turn"]')
  ];
  const candidates = markers.map((marker) => {
    return marker.closest('[data-testid^="conversation-turn"], article, section, [role="article"]') || marker.parentElement;
  });
  return uniqueElements(candidates).filter(isElementEligible);
}

function repeatedChildrenScore(container) {
  const children = [...container.children].filter(isElementEligible);
  if (children.length < 8) return null;
  const heights = children.map((child) => child.getBoundingClientRect().height).filter((height) => height > 0);
  if (heights.length < 8) return null;
  const total = heights.reduce((sum, height) => sum + height, 0);
  const average = total / heights.length;
  if (average < 70 || total < window.innerHeight * 4) return null;
  return { container, children, score: children.length * Math.min(average, 1200) };
}

function discoverGenericSegments(document, scrollRoot) {
  const semantic = uniqueElements([
    ...document.querySelectorAll('main > article, main > section, [role="feed"] > *, [role="list"] > [role="listitem"]')
  ]).filter(isElementEligible);
  if (semantic.length >= 8) return semantic;

  const roots = uniqueElements([
    scrollRoot,
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body
  ]).filter(Boolean);

  const scored = roots.map(repeatedChildrenScore).filter(Boolean).sort((a, b) => b.score - a.score);
  return scored[0]?.children || [];
}

function chooseAdapter(document, config = {}) {
  const explicit = discoverExplicitSegments(document);
  if (explicit.length) return { name: 'explicit', elements: explicit };

  const chat = discoverChatSegments(document);
  if (chat.length >= 4) return { name: 'chat', elements: chat };

  if (config.genericSegmentation === false) return { name: 'disabled', elements: [] };
  const scrollRoot = findScrollRoot(document);
  return { name: 'generic', elements: discoverGenericSegments(document, scrollRoot) };
}

module.exports = {
  chooseAdapter,
  discoverChatSegments,
  discoverExplicitSegments,
  discoverGenericSegments,
  findScrollRoot,
  isElementEligible,
  uniqueElements
};
