'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

function registerLongViewPrivileges(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'longview',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true
      }
    }
  ]);
}

function resolveRoute(appRoot, requestUrl) {
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase();
  const pathname = decodeURIComponent(url.pathname || '/');
  const internalHosts = new Set(['newtab', 'history', 'bookmarks', 'settings', 'about']);

  let root;
  let indexFile;
  if (internalHosts.has(host)) {
    root = path.join(appRoot, 'src', 'internal');
    indexFile = host === 'newtab' ? 'newtab.html' : 'library.html';
  } else if (host === 'benchmark') {
    root = path.join(appRoot, 'benchmarks', 'fixtures');
    indexFile = 'conversation.html';
  } else {
    root = path.join(appRoot, 'src', 'internal');
    indexFile = 'newtab.html';
  }

  const relative = pathname === '/' ? indexFile : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(path.resolve(root) + path.sep) && candidate !== path.resolve(root, indexFile)) {
    return path.join(root, indexFile);
  }
  return candidate;
}

function registerLongViewHandler({ protocol, net, appRoot }) {
  protocol.handle('longview', (request) => {
    const filePath = resolveRoute(appRoot, request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

module.exports = {
  registerLongViewHandler,
  registerLongViewPrivileges,
  resolveRoute
};
