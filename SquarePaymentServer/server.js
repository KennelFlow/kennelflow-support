import express from 'express';
import crypto from 'crypto';
import { Client, Environment } from 'square';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const isProduction = process.env.SQUARE_ENVIRONMENT === 'production';
const accessToken = process.env.SQUARE_ACCESS_TOKEN;
const configuredLocationID = (process.env.SQUARE_LOCATION_ID || '').trim();
const maxPaymentCents = Number.parseInt(process.env.MAX_PAYMENT_CENTS || '5000000', 10); // $50,000 default ceiling

if (!accessToken) {
  console.error('Missing SQUARE_ACCESS_TOKEN');
  process.exit(1);
}

const environment = isProduction ? Environment.Production : Environment.Sandbox;
const client = new Client({ bearerAuthCredentials: { accessToken }, environment });

app.get('/health', (_, res) => {
  res.json({ ok: true, environment: isProduction ? 'production' : 'sandbox' });
});

app.get('/square/config', (_, res) => {
  res.json({
    environment: isProduction ? 'production' : 'sandbox',
    locationIDConfigured: Boolean(configuredLocationID),
    maxPaymentCents
  });
});

app.post('/square/create-payment', async (req, res) => {
  try {
    const {
      sourceID,
      locationID,
      amountCents,
      currency = 'USD',
      customerName = '',
      description = '',
      idempotencyKey: clientIdempotencyKey = ''
    } = req.body ?? {};

    if (!sourceID || !locationID || !Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'Missing or invalid payment fields.' });
    }
    if (amountCents > maxPaymentCents) {
      return res.status(400).json({ error: 'Payment amount exceeds the configured server limit.' });
    }
    if (configuredLocationID && locationID !== configuredLocationID) {
      return res.status(400).json({ error: 'Location ID does not match the configured Square location.' });
    }
    if (currency !== 'USD') {
      return res.status(400).json({ error: 'Only USD payments are enabled for this KennelFlow server.' });
    }

    const idempotencyKey = (clientIdempotencyKey || crypto.randomUUID()).slice(0, 45);
    const response = await client.paymentsApi.createPayment({
      sourceId: sourceID,
      idempotencyKey,
      locationId: locationID,
      amountMoney: { amount: BigInt(amountCents), currency },
      note: [customerName, description].filter(Boolean).join(' • ').slice(0, 500)
    });

    const payment = response.result.payment;
    return res.json({
      paymentID: payment?.id ?? idempotencyKey,
      status: payment?.status ?? 'COMPLETED'
    });
  } catch (error) {
    const detail = error?.result?.errors?.[0]?.detail || error?.message || 'Square payment failed.';
    return res.status(500).json({ error: detail });
  }
});

const port = Number.parseInt(process.env.PORT || '3000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`KennelFlow payment server running on port ${port} (${isProduction ? 'production' : 'sandbox'})`);
});
