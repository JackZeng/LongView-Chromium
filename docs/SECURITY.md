# Security model

## Process boundaries

The browser toolbar is a trusted local WebContents with context isolation and sandboxing. Ordinary pages run with Node integration disabled, context isolation enabled, web security enabled, and a persistent Chromium session.

The page preload currently uses `sandbox: false` so it can load the local LongView engine modules. Those modules are not exposed to the page's JavaScript world. This is a conscious MVP tradeoff; a production release should bundle the preload into a single sandbox-compatible file and re-enable renderer sandboxing.

## Internal API

A minimal `longviewInternal` bridge exists in all tab preloads, but the browser process rejects every invocation unless the sender URL uses the trusted `longview://` scheme. Web pages cannot use it to read history, bookmarks, or settings.

## Navigation

`javascript:` and `data:` address-bar navigation are converted into search queries. Unknown schemes are denied; `mailto:` and `tel:` may be handed to the operating system. New windows are converted into tabs.

## Permissions

Fullscreen and sanitized clipboard writes are allowed. Media, notifications, and geolocation require an explicit prompt. Other permissions are denied in the MVP. Grants last for the process lifetime rather than being silently persisted.

## Content manipulation

Compatibility and Balanced modes use standardized CSS rendering primitives. Aggressive mode can change script-visible geometry and animation behavior and must remain opt-in.

## Distribution

Do not distribute unsigned builds as trusted production software. Release builds should add code signing, notarization, update signature verification, dependency lockfiles, security-response policy, and periodic Electron/Chromium security updates.
