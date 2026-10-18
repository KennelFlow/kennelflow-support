// Cloudflare Pages bridge for the existing Kennel One business API.
// This is intentionally a temporary compatibility layer. Keep Render online
// while migrating authentication, staff records, and payments off the old server.
// The browser uses same-origin /api/* requests and never receives backend tokens.
const RENDER_API = 'https://kennelflow-web.onrender.com';

export async function onRequest({request}) {
  const current = new URL(request.url);
  if (!current.pathname.startsWith('/api/')) {
    return new Response('Not found', {status: 404});
  }
  const unsafe = !['GET', 'HEAD'].includes(request.method);
  const origin = request.headers.get('origin');
  let validOrigin = false;
  if (origin) {
    try { validOrigin = new URL(origin).origin === current.origin; }
    catch { validOrigin = false; }
    if (!validOrigin) return new Response('Origin not allowed', {status: 403});
  }
  if (unsafe && (!origin || request.headers.get('sec-fetch-site') === 'cross-site')) {
    return new Response('Open this page again before saving', {status: 403});
  }
  const target = new URL(current.pathname + current.search, RENDER_API);
  const headers = new Headers(request.headers);
  for (const name of ['host','x-forwarded-host','x-forwarded-proto','forwarded','x-real-ip','true-client-ip','cf-connecting-ip','referer']) headers.delete(name);
  if (origin) headers.set('origin', RENDER_API);
  else headers.delete('origin');
  if (unsafe) headers.set('sec-fetch-site', 'same-origin');
  const init = {method: request.method, headers, redirect: 'manual'};
  if (unsafe) { init.body = request.body; init.duplex = 'half'; }
  try {
    const upstream = await fetch(new Request(target, init));
    if (upstream.status >= 300 && upstream.status < 400)
      return new Response('Backend redirect blocked', {status: 502});
    const result = new Response(upstream.body, upstream);
    result.headers.set('Cache-Control','no-store');
    result.headers.set('X-Content-Type-Options','nosniff');
    return result;
  } catch {
    return new Response(JSON.stringify({error: 'Kennel One cloud is reconnecting. Please try again.'}), {
      status: 503,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    });
  }
}
