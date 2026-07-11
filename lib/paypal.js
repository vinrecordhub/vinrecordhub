// lib/paypal.js
// Server-side PayPal REST helpers shared by paypal-order and paypal-webhook.
// All calls go direct to PayPal with client credentials — nothing here trusts
// client-supplied amounts or statuses.

const API_BASE = process.env.PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal token ${res.status}`);
  const { access_token } = await res.json();
  return access_token;
}

async function ppFetch(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  return { status: res.status, ok: res.ok, json };
}

// Create an order for a fixed USD amount. custom_id carries our credit_orders
// row id so the webhook can correlate independently of the client.
function createOrder({ amountUsd, description, customId }) {
  return ppFetch('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: String(customId),
        description,
        amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
      }],
      application_context: { shipping_preference: 'NO_SHIPPING' },
    },
  });
}

function captureOrder(orderId) {
  return ppFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST' });
}

function getOrder(orderId) {
  return ppFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

// Server-to-server webhook signature verification. Requires PAYPAL_WEBHOOK_ID
// (the id PayPal assigns when the webhook is registered in the dashboard).
async function verifyWebhookSignature(headers, event) {
  const { json } = await ppFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      transmission_id: headers['paypal-transmission-id'],
      transmission_time: headers['paypal-transmission-time'],
      transmission_sig: headers['paypal-transmission-sig'],
      cert_url: headers['paypal-cert-url'],
      auth_algo: headers['paypal-auth-algo'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });
  return json && json.verification_status === 'SUCCESS';
}

module.exports = { createOrder, captureOrder, getOrder, verifyWebhookSignature };
