/* Flamingo Companion service worker.
 *
 * Deliberately network-first: when online it always fetches fresh content, so it
 * can never serve a stale hashed asset or an old app shell. It caches each GET it
 * sees, and falls back to that cache only when the network is unavailable. That is
 * what makes the Companion installable and usable in poor connectivity without
 * risking staleness. This does not add a backend; it is an offline shell only.
 */
const CACHE = 'flamingo-companion-v1'
const BASE = new URL(self.registration.scope).pathname
const SHELL = [BASE + 'companion', BASE]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  if (new URL(req.url).origin !== self.location.origin) return
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req)
      // Only cache successful responses, so a transient 4xx/5xx is never stored
      // and served as a stale error page offline.
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE)
        cache.put(req, fresh.clone()).catch(() => {})
      }
      return fresh
    } catch {
      const cached = await caches.match(req)
      if (cached) return cached
      if (req.mode === 'navigate') {
        const shell = await caches.match(BASE + 'companion')
        if (shell) return shell
      }
      return Response.error()
    }
  })())
})
