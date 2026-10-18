// Same-origin checkout gateway for the Kennel One Cloudflare Pages storefront.
// The production Square service remains on the existing payments.kennelone.app host.
// No payment credentials or customer payment-card information is stored here.
const DESTINATION = 'https://payments.kennelone.app/store/create-checkout';
const json = (body, status) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export async function onRequest({ request }) {
  const own = new URL(request.url);
  if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  const origin = request.headers.get('origin');
  if (!origin || origin !== own.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({error: 'Open the Kennel One store before checking out.'}, 403);
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    return json({error: 'JSON content required'}, 415);
  }
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 32768) return json({error:'Order request too large'}, 413);
  const data = await request.text();
  if (data.length > 32768) return json({error:'Order request too large'}, 413);
  let payload;
  try { payload = JSON.parse(data); } catch { return json({error:'Invalid order'}, 400); }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items) || !payload.items.length) {
    return json({error:'Your cart is empty'}, 400);
  }
  try {
    const response = await fetch(DESTINATION, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept':'application/json'},
      body: data,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000)
    });
    if (response.status >= 300 && response.status < 400) {
      return json({error:'Checkout temporarily unavailable'}, 502);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return json({error:'Invalid checkout response'}, 502);
    }
    return new Response(response.body, {
      status: response.status,
      headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
    });
  } catch {
    return json({error:'Checkout temporarily unavailable. Please try again.'}, 503);
  }
}
