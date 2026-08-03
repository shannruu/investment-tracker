/* =============================================================================
 * Divz — service worker
 * -----------------------------------------------------------------------------
 * Two jobs: makes the app installable ("Add to Home Screen") and lets the app
 * shell load when offline — the app's actual data already lives in localStorage,
 * not here, so this is purely about the HTML/JS/CSS shell being available.
 *
 * Caching strategy deliberately follows the app's existing ?v=N cache-busting
 * scheme rather than fighting it:
 *  - /api/* is never cached — quotes, search and dividend history must always
 *    be live, never served stale from here.
 *  - Versioned static assets (app.js?v=250 etc.) are cache-first: each version
 *    is a distinct, immutable URL, so a new deploy naturally requests a new
 *    ?v= and is a normal cache miss — no manual invalidation needed.
 *  - Everything else (index.html, manifest.json, icons) is network-first, so
 *    the shell stays current online, falling back to the last cached copy only
 *    when there's no connection at all.
 * ========================================================================== */
const CACHE_NAME = "il-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.searchParams.has("v")) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
