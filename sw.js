const CACHE_NAME = "rid-mobile-offline-v2";
const APP_SHELL = [
  "./mobile.html",
  "./mobile.css",
  "./mobile-app.js",
  "./mobile-manifest.json",
  "./icon.png",
  "./icon-192.png",
  "./logo.png"
];

const EXTERNAL_ASSETS = [
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn("Falha ao salvar asset no cache:", asset, error);
      }
    }));

    await Promise.allSettled(EXTERNAL_ASSETS.map(async (url) => {
      const response = await fetch(new Request(url, { mode: "no-cors" }));
      await cache.put(url, response);
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.searchParams.has("network-check")) {
    return;
  }

  const bypassHosts = [
    "firestore.googleapis.com",
    "www.googleapis.com",
    "securetoken.googleapis.com",
    "identitytoolkit.googleapis.com",
    "firebaseinstallations.googleapis.com"
  ];

  if (bypassHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    try {
      const response = await fetch(event.request);
      cache.put(event.request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        return cache.match("./mobile.html");
      }
      throw error;
    }
  })());
});
