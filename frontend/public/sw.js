/**
 * Minimal offline-fallback service worker — deliberately NOT offline-first.
 *
 * Metro (this project's web bundler) has no Workbox/PWA build integration
 * at all — Expo's own docs route around that by running Workbox CLI as a
 * separate post-export step against the built dist/, generating a
 * precache-everything service worker from a manifest of every build
 * output. That's real complexity (a new devDependency, a workbox-config.js,
 * an extra build step) for full offline-first caching, which is more than
 * "installable, looks like a real app" (what was actually asked for) needs
 * — and its generated output can only be exercised against a production
 * `expo export -p web`, never this dev server.
 *
 * This is hand-written instead: small, no new dependency, and it actually
 * registers and runs against the dev server too (not just a production
 * export), so at least this much is locally verifiable. Scope is
 * deliberately narrow:
 *   - On install, cache just the app shell (the start page + manifest).
 *   - On navigation requests, try the network first and fall back to
 *     whatever's cached if the network fails — so a previously-visited
 *     session still opens offline, without ever risking a stale bundle
 *     silently winning over a real deploy (the classic aggressive-
 *     precaching PWA bug class).
 *   - Everything else (API calls, images, hashed JS/CSS chunks) passes
 *     straight through, untouched. If full offline-first caching is
 *     wanted later, that's exactly where Workbox's generateSW would slot
 *     in — this file is intentionally not trying to be that.
 */

const CACHE_NAME = "cinelog-shell-v1";
const SHELL_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop any cache from a previous version of this file — bump CACHE_NAME
  // above when the shell list changes and old entries should go away.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only ever intercept top-level navigations (loading/reloading the app
  // itself) — API calls, images, and fingerprinted JS/CSS chunks pass
  // through to the network exactly as if this worker didn't exist.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep the shell cache fresh with whatever the network actually
        // served, so the offline fallback below never gets too stale.
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
        return response;
      })
      .catch(() => caches.match("/"))
  );
});
