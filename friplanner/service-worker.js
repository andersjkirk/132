const CACHE_NAME = "friplanner-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/holidays.js",
  "./js/bridge-logic.js",
  "./js/storage.js",
  "./js/effects.js",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // activate the new version immediately
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first: always try to fetch the latest version when online, and fall
   back to the cached copy only when offline. Keeps the app fresh after each
   deploy while still working without a connection. */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
