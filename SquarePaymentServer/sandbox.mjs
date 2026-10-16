import http from 'node:http';

// Dedicated sandbox entrypoint. Production credentials are never used or read here.
process.env.SQUARE_ENVIRONMENT = 'sandbox';
const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
const location = process.env.SQUARE_SANDBOX_LOCATION_ID;
if (!token || !location) {
  http.createServer((req, res) => {
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ok:true,environment:'sandbox',configured:false,checkoutEnabled:false}));
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({error:'Sandbox credentials not configured. No transactions possible.'}));
    }
  }).listen(Number(process.env.PORT||4174),'0.0.0.0');
} else {
  // Only sandbox-specific environment variables are used for the payment SDK.
  process.env.SQUARE_ACCESS_TOKEN = token;
  process.env.SQUARE_LOCATION_ID = location;
  await import('./server.js');
}
