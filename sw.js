const CACHE_NAME = 'senai-gpt-v1';
const ASSETS = [
    '/kaua1/2026/aulaIA/chatBot1/index.html',
    '/kaua1/2026/aulaIA/chatBot1/style.css',
    '/kaua1/2026/aulaIA/chatBot1/index.js',
    '/kaua1/2026/aulaIA/chatBot1/img/SENAI-AI 1.png'
];

// Install
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — Network first, fallback to cache
self.addEventListener('fetch', (e) => {
    // Skip API requests
    if (e.request.url.includes('googleapis.com')) return;

    e.respondWith(
        fetch(e.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
