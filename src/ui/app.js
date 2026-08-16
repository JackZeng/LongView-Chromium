'use strict';

const api = window.longviewBrowser;
let state = null;
let findRequest = '';

const elements = {
  tabs: document.querySelector('#tabs'),
  newTab: document.querySelector('#new-tab'),
  back: document.querySelector('#back'),
  forward: document.querySelector('#forward'),
  reload: document.querySelector('#reload'),
  home: document.querySelector('#home'),
  address: document.querySelector('#address'),
  security: document.querySelector('#security-indicator'),
  bookmark: document.querySelector('#bookmark'),
  toggle: document.querySelector('#longview-toggle'),
  mode: document.querySelector('#longview-mode'),
  metrics: document.querySelector('#metrics'),
  history: document.querySelector('#history'),
  settings: document.querySelector('#settings'),
  findBar: document.querySelector('#find-bar'),
  findInput: document.querySelector('#find-input'),
  findResult: document.querySelector('#find-result'),
  findPrev: document.querySelector('#find-prev'),
  findNext: document.querySelector('#find-next'),
  findClose: document.querySelector('#find-close')
};

function command(name, payload) {
  return api.command(name, payload).catch((error) => console.error(error));
}

function createTabElement(tab) {
  const node = document.createElement('div');
  node.className = `tab${tab.id === state.activeTabId ? ' active' : ''}${tab.loading ? ' loading' : ''}`;
  node.role = 'tab';
  node.title = tab.title || tab.url;
  node.addEventListener('mousedown', (event) => {
    if (event.button === 1) command('close-tab', { id: tab.id });
    else if (event.button === 0) command('activate-tab', { id: tab.id });
  });

  let favicon;
  if (tab.favicon) {
    favicon = document.createElement('img');
    favicon.src = tab.favicon;
    favicon.alt = '';
    favicon.className = 'favicon';
    favicon.addEventListener('error', () => favicon.replaceWith(createFallbackFavicon()));
  } else favicon = createFallbackFavicon();

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || 'New Tab';

  const close = document.createElement('button');
  close.className = 'tab-close';
  close.textContent = '×';
  close.title = 'Close tab';
  close.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    command('close-tab', { id: tab.id });
  });

  node.append(favicon, title, close);
  return node;
}

function createFallbackFavicon() {
  const fallback = document.createElement('span');
  fallback.className = 'favicon fallback';
  fallback.textContent = 'L';
  return fallback;
}

function render(nextState) {
  state = nextState;
  elements.tabs.replaceChildren(...state.tabs.map(createTabElement));
  const active = state.active;
  if (!active) return;

  elements.back.disabled = !active.canGoBack;
  elements.forward.disabled = !active.canGoForward;
  elements.reload.textContent = active.loading ? '×' : '↻';
  elements.reload.title = active.loading ? 'Stop' : 'Reload';

  if (document.activeElement !== elements.address) elements.address.value = active.displayUrl || '';
  elements.bookmark.textContent = active.isBookmarked ? '★' : '☆';
  elements.bookmark.classList.toggle('active', active.isBookmarked);

  const secure = /^https:|^longview:/i.test(active.url);
  elements.security.classList.toggle('insecure', !secure);
  elements.security.title = active.isInternal ? 'LongView internal page' : secure ? 'Secure connection' : 'Not a secure connection';

  elements.toggle.classList.toggle('enabled', state.settings.longviewEnabled);
  elements.mode.value = state.settings.longviewMode;
  elements.mode.disabled = !state.settings.longviewEnabled;

  const metrics = active.metrics;
  if (metrics) {
    elements.metrics.textContent = `${Math.round(metrics.estimatedFps || 0)} fps · ${metrics.hot || 0}/${metrics.segments || 0}`;
    elements.metrics.title = [
      `Adapter: ${metrics.adapter}`,
      `Segments: ${metrics.hot} hot / ${metrics.warm} warm / ${metrics.cold} cold`,
      `Frame p95: ${metrics.frameP95Ms} ms`,
      `Long tasks (10s): ${metrics.longTasks10s}`,
      `DOM nodes: ${metrics.domNodes}`,
      `Velocity: ${metrics.scrollVelocity} px/s`
    ].join('\n');
  } else {
    elements.metrics.textContent = state.settings.longviewEnabled ? 'Starting…' : 'Off';
    elements.metrics.title = 'LongView metrics are not available yet.';
  }
}

function showFind() {
  elements.findBar.hidden = false;
  elements.findInput.focus();
  elements.findInput.select();
}

function hideFind() {
  elements.findBar.hidden = true;
  command('stop-find', { action: 'keepSelection' });
}

function runFind(forward = true, findNext = false) {
  const text = elements.findInput.value;
  findRequest = text;
  command('find', { text, options: { forward, findNext } });
}

elements.newTab.addEventListener('click', () => command('new-tab'));
elements.back.addEventListener('click', () => command('back'));
elements.forward.addEventListener('click', () => command('forward'));
elements.reload.addEventListener('click', () => command('reload'));
elements.home.addEventListener('click', () => command('home'));
elements.bookmark.addEventListener('click', () => command('toggle-bookmark'));
elements.history.addEventListener('click', () => command('open-internal', { page: 'history' }));
elements.settings.addEventListener('click', () => command('open-internal', { page: 'settings' }));
elements.metrics.addEventListener('click', () => command('open-internal', { page: 'settings' }));

elements.address.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    command('navigate', { input: elements.address.value });
    elements.address.blur();
  } else if (event.key === 'Escape') {
    elements.address.value = state?.active?.displayUrl || '';
    elements.address.blur();
  }
});
elements.address.addEventListener('focus', () => elements.address.select());

elements.toggle.addEventListener('click', () => {
  command('set-longview-enabled', { enabled: !state.settings.longviewEnabled });
});
elements.mode.addEventListener('change', () => command('set-longview-mode', { mode: elements.mode.value }));

elements.findInput.addEventListener('input', () => runFind(true, false));
elements.findInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runFind(!event.shiftKey, true);
  if (event.key === 'Escape') hideFind();
});
elements.findPrev.addEventListener('click', () => runFind(false, true));
elements.findNext.addEventListener('click', () => runFind(true, true));
elements.findClose.addEventListener('click', hideFind);

api.onState(render);
api.onShowFind(showFind);
api.onFindState((result) => {
  if (!result || result.requestId === 0) return;
  elements.findResult.textContent = result.matches > 0 ? `${result.activeMatchOrdinal}/${result.matches}` : '0/0';
});
api.getState().then(render).catch(console.error);
