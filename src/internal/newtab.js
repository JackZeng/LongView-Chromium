'use strict';

const api = window.longviewInternal;
const recentList = document.querySelector('#recent-list');

function open(url) {
  api.command('navigate', { url });
}

function renderRecent(data) {
  const history = (data.history || []).slice(0, 8);
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Your recent pages will appear here.';
    recentList.replaceChildren(empty);
    return;
  }
  const nodes = history.map((entry) => {
    const item = document.createElement('button');
    item.className = 'list-item';
    item.style.textAlign = 'left';
    item.style.width = '100%';
    item.addEventListener('click', () => open(entry.url));
    const main = document.createElement('span');
    main.className = 'list-main';
    const title = document.createElement('span');
    title.className = 'list-title';
    title.style.display = 'block';
    title.textContent = entry.title || entry.url;
    const url = document.createElement('span');
    url.className = 'list-url';
    url.style.display = 'block';
    url.textContent = entry.url;
    main.append(title, url);
    item.append(main);
    return item;
  });
  recentList.replaceChildren(...nodes);
}

document.querySelector('#search').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#query');
  if (input.value.trim()) api.command('navigate', { input: input.value });
});

document.querySelectorAll('[data-url]').forEach((button) => {
  button.addEventListener('click', () => open(button.dataset.url));
});
document.querySelector('#all-history').addEventListener('click', () => open('longview://history/'));

api.getData().then(renderRecent);
api.onDataChanged(renderRecent);
