'use strict';

const api = window.longviewInternal;
const page = ['history', 'bookmarks', 'settings'].includes(location.hostname) ? location.hostname : 'settings';
const title = document.querySelector('#title');
const content = document.querySelector('#content');
const actions = document.querySelector('#header-actions');
let browserData = null;

document.querySelectorAll('[data-page]').forEach((button) => {
  button.classList.toggle('active', button.dataset.page === page);
  button.addEventListener('click', () => api.command('navigate', { url: `longview://${button.dataset.page}/` }));
});

function button(label, className, onClick) {
  const node = document.createElement('button');
  node.textContent = label;
  node.className = className;
  node.addEventListener('click', onClick);
  return node;
}

function listItem(entry, type) {
  const item = document.createElement('div');
  item.className = 'list-item';
  const main = document.createElement('div');
  main.className = 'list-main';
  const name = document.createElement('div');
  name.className = 'list-title';
  name.textContent = entry.title || entry.url;
  const url = document.createElement('div');
  url.className = 'list-url';
  url.textContent = entry.url;
  main.append(name, url);
  item.append(
    main,
    button('Open', 'ghost', () => api.command('open-url', { url: entry.url })),
    button('Remove', 'danger', () => api.command(type === 'history' ? 'remove-history' : 'remove-bookmark', entry))
  );
  return item;
}

function renderList(type) {
  const entries = browserData[type] || [];
  title.textContent = type === 'history' ? 'History' : 'Bookmarks';
  actions.replaceChildren();
  if (type === 'history' && entries.length) {
    actions.append(button('Clear history', 'danger', () => api.command('clear-history')));
  }
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = type === 'history' ? 'No browsing history yet.' : 'No bookmarks yet.';
    content.replaceChildren(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'list';
  list.append(...entries.map((entry) => listItem(entry, type)));
  content.replaceChildren(list);
}

function settingCard(name, description, control) {
  const card = document.createElement('div');
  card.className = 'setting card';
  const copy = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = name;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  copy.append(heading, paragraph);
  card.append(copy, control);
  return card;
}

function checkbox(value) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.checked = Boolean(value);
  return input;
}

function renderSettings() {
  title.textContent = 'Settings';
  const settings = browserData.settings;
  const form = document.createElement('form');
  form.className = 'settings';

  const enabled = checkbox(settings.longviewEnabled);
  enabled.name = 'longviewEnabled';

  const mode = document.createElement('select');
  mode.name = 'longviewMode';
  for (const [value, label] of [['compatibility','Compatibility'], ['balanced','Balanced'], ['aggressive','Aggressive']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = settings.longviewMode === value;
    mode.append(option);
  }

  const hot = document.createElement('input');
  hot.type = 'number'; hot.name = 'hotScreens'; hot.min = '0.5'; hot.max = '8'; hot.step = '0.5'; hot.value = settings.hotScreens;
  const warm = document.createElement('input');
  warm.type = 'number'; warm.name = 'warmScreens'; warm.min = '2'; warm.max = '30'; warm.step = '1'; warm.value = settings.warmScreens;
  const prediction = document.createElement('input');
  prediction.type = 'number'; prediction.name = 'predictionMs'; prediction.min = '0'; prediction.max = '1000'; prediction.step = '20'; prediction.value = settings.predictionMs;
  const generic = checkbox(settings.genericSegmentation); generic.name = 'genericSegmentation';
  const restore = checkbox(settings.restoreSession); restore.name = 'restoreSession';
  const search = document.createElement('input');
  search.type = 'text'; search.name = 'searchTemplate'; search.value = settings.searchTemplate;

  form.append(
    settingCard('Enable LongView', 'Apply the segment lifecycle engine to ordinary web pages.', enabled),
    settingCard('Mode', 'Compatibility preserves the most web behavior; aggressive freezes distant content more strongly.', mode),
    settingCard('HOT range', 'Number of screens around the viewport kept fully active.', hot),
    settingCard('WARM range', 'Number of screens preheated around the predicted viewport.', warm),
    settingCard('Prediction window', 'How far ahead scroll velocity is projected, in milliseconds.', prediction),
    settingCard('Generic segmentation', 'Use conservative repeated-content heuristics when no site adapter is available.', generic),
    settingCard('Restore previous session', 'Reopen tabs from the previous LongView window.', restore),
    settingCard('Search URL template', 'Use %s where the encoded search query should be inserted.', search)
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    api.command('save-settings', {
      settings: {
        longviewEnabled: enabled.checked,
        longviewMode: mode.value,
        hotScreens: Number(hot.value),
        warmScreens: Number(warm.value),
        predictionMs: Number(prediction.value),
        genericSegmentation: generic.checked,
        restoreSession: restore.checked,
        searchTemplate: search.value
      }
    });
  });

  const save = button('Save settings', 'primary', () => form.requestSubmit());
  actions.replaceChildren(save, button('Run 1,000-turn benchmark', 'ghost', () => api.command('run-benchmark', { turns: 1000 })));

  const version = document.createElement('div');
  version.className = 'version card';
  version.textContent = [
    `Electron: ${browserData.version.electron_version || 'unknown'}`,
    `Chromium: ${browserData.version.chromium_version || 'unknown'}`,
    `Chromium SHA: ${browserData.version.chromium_git_sha || 'unknown'}`,
    `V8: ${browserData.version.v8_version || 'unknown'}`
  ].join('\n');

  content.replaceChildren(form, version);
}

function render(data) {
  browserData = data;
  if (page === 'settings') renderSettings();
  else renderList(page);
}

api.getData().then(render);
api.onDataChanged(render);
