// Khata Book service worker
// Kaam: app ki files phone me save karna taaki net na ho tab bhi app khule.
// Data (sale/buy/udhaar) yahan cache nahi hota — wo localStorage + Firebase se aata hai.

// Jab bhi index.html update karo, ye version number badha dena (v1 -> v2 -> v3),
// tabhi phone par naya version aayega.
const CACHE_VERSION = 'khatabook-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Firebase SDK: app iske bina nahi chalta, isliye install ke waqt hi zabardasti save karte hain.
// (Agar index.html me Firebase ka version badlo, to yahan bhi wahi version likhna.)
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js'
];

// Ye external files (Firebase SDK, fonts) bhi ek baar save ho jayengi
const EXTERNAL_CACHEABLE = [
  'https://www.gstatic.com/firebasejs/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Firebase SDK ek-ek karke: koi ek fail ho to bhi baaki app install ho jaye,
      // aur agli baar jab net ho tab fetch handler use save kar lega.
      await Promise.all(FIREBASE_SDK.map((url) =>
        fetch(url).then((res) => { if (res.ok) return cache.put(url, res); }).catch(() => {})
      ));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase database / login ki API calls ko kabhi cache nahi karna
  // (firestore.googleapis.com, identitytoolkit, securetoken sab yahin aate hain)
  const isFirebaseApi =
    url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts.');
  if (isFirebaseApi) return;

  // Page kholna (HTML): pehle net se naya lo, net na ho to saved wala dikhao
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Firebase SDK aur fonts: ek baar save, phir hamesha saved se (fast + offline)
  const isExternalCacheable = EXTERNAL_CACHEABLE.some((p) => req.url.startsWith(p));
  if (isExternalCacheable) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Apni site ki baaki files (icons, manifest): saved pehle, warna net se
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
