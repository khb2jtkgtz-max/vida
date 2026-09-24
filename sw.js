/* Vida service worker — network-first shell; solid offline fallback */
const CACHE = "vida-static-v82";
const V = "11254";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=" + V,
  "./app.js",
  "./app.js?v=" + V,
  "./manifest.webmanifest",
  "./version.json",
  "./data/mm-import.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png?v=" + V,
  "./icons/icon-512.png?v=" + V,
  "./icons/apple-touch-icon.png?v=" + V
];

function precache() {
  return caches.open(CACHE).then((cache) =>
    Promise.all(
      ASSETS.map((url) =>
        cache.add(url).catch((err) => {
          console.warn("[vida-sw] skip", url, err);
        })
      )
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
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

async function matchCache(req) {
  const exact = await caches.match(req);
  if (exact) return exact;
  const loose = await caches.match(req, { ignoreSearch: true });
  if (loose) return loose;
  const url = new URL(req.url);
  const path = url.pathname;
  if (path.endsWith("/") || path.endsWith("/vida") || path.endsWith("/vida/") || path.endsWith("index.html")) {
    return (
      (await caches.match("./index.html")) ||
      (await caches.match("./")) ||
      (await caches.match("index.html"))
    );
  }
  if (path.endsWith("app.js")) {
    return (await caches.match("./app.js?v=" + V)) || (await caches.match("./app.js"));
  }
  if (path.endsWith("styles.css")) {
    return (await caches.match("./styles.css?v=" + V)) || (await caches.match("./styles.css"));
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/sync") || url.hostname === "mantledb.sh") {
    return;
  }
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const isShell = (
    url.pathname.endsWith("version.json") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/sw.js") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/vida/") ||
    url.pathname.endsWith("/vida") ||
    url.pathname.endsWith("manifest.webmanifest")
  );

  if (isShell) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok && !url.pathname.endsWith("version.json") && !url.pathname.endsWith("/sw.js")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => {
            cache.put(req, copy);
            // also store without query so offline ignoreSearch finds it
            try {
              const bare = url.pathname.replace(/.*\//, "./");
              if (bare === "./app.js" || bare === "./styles.css" || bare === "./index.html") {
                cache.put(bare, res.clone());
              }
            } catch (_) {}
          }).catch(() => {});
        }
        return res;
      }).catch(() => matchCache(req).then((c) => c || new Response(
        "<!doctype html><meta charset=utf-8><title>Vida</title><p>Sin conexión y sin copia local. Abre Vida una vez con internet.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      )))
    );
    return;
  }

  event.respondWith(
    matchCache(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => new Response("", { status: 503, statusText: "Offline" }));
    })
  );
});
