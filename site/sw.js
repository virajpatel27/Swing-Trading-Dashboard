/* Service worker: the app works offline with the last data it saw.
   App files: cache first. Data (data/...): network first, cached copy when offline. Chart library: cached after first use. */
const CACHE = "sd-__BUILD__";
const SHELL = ["./", "index.html", "styles.css", "logic.js", "ind.js", "scan.js", "fin.js", "chart.js", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isData = url.origin === location.origin && url.pathname.includes("/data/");
  if (isData) {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // exact match (with ?v=<build>): an old build's file is never served for a new page
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
