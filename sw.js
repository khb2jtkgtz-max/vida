/* Vida service worker — cache-first for static assets; offline-ready */
const CACHE = "vida-static-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./version.json",
  "./data/mm-import.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/sync") || url.hostname === "mantledb.sh") {
    return;
  }
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Always network for version check so the app can detect updates
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Stale-while-revalidate for HTML/JS/CSS
        const isShell = /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith("/");
        if (isShell) {
          fetch(req).then((res) => {
            if (res && res.ok) {
              caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
            }
          }).catch(() => {});
        }
        return cached;
      }
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) {
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", { status: 503, statusText: "Offline" });
      });
    })
  );
});
