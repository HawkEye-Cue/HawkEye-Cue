// HawkEye-Cue Service Worker — PWA "Add to Home Screen" + Android Share Target
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const SHARE_CACHE = 'hawkeye-share';

// Handle "Share → HawkEye-Cue" from the Android share sheet.
// The manifest posts shared title/text/url/image here; we stash it and redirect
// the opened window into the analyzer, which reads it back out.
async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const file = formData.get('image');

    const cache = await caches.open(SHARE_CACHE);

    // Store text payload
    const combinedText = [title, text, url].filter(Boolean).join('\n').trim();
    await cache.put('/__shared_text', new Response(combinedText, { headers: { 'Content-Type': 'text/plain' } }));

    // Store shared image (if any) so the app can OCR it
    if (file && typeof file !== 'string' && file.size > 0) {
      await cache.put('/__shared_image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
    } else {
      await cache.delete('/__shared_image');
    }
  } catch (e) {
    // If parsing fails, just proceed to the app.
  }
  // Redirect to the analyzer; the app reads the cached payload.
  return Response.redirect('/pipeline?radar=1&shared=1', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Share target POST
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // App reads the stashed shared payload
  if (event.request.method === 'GET' && (url.pathname === '/__shared_text' || url.pathname === '/__shared_image')) {
    event.respondWith(
      caches.open(SHARE_CACHE).then((c) => c.match(url.pathname).then((r) => r || new Response('', { status: 404 })))
    );
    return;
  }

  // Default: network-first, fall back to cache
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
