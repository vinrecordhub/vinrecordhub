// api/paypal-webhook.js
// Receives PayPal webhook events. The ONLY funding source for credits besides
// the server-verified capture path — both converge on apply_credit_purchase(),
// which is idempotent on the capture id, so replays and races cannot double-grant.
//
// Register in the PayPal dashboard for event PAYMENT.CAPTURE.COMPLETED and put
// the assigned webhook id in PAYPAL_WEBHOOK_ID.

const { supabase } = require('../lib/supabase-server');
const paypal = require('../lib/paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST only' } });

  const event = req.body;
  if (!event || !event.event_type) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'No event' } });
  }

  // Signature verification via PayPal's verify API — a forged event never
  // reaches business logic.
  let verified = false;
  try {
    verified = await paypal.verifyWebhookSignature(req.headers, event);
  } catch (err) {
    console.error('webhook verify call failed:', err.message);
    return res.status(500).json({ error: { code: 'verify_unavailable', message: 'Retry' } }); // PayPal retries on 5xx
  }
  if (!verified) {
    console.error('Invalid PayPal webhook signature', event.id);
    return res.status(401).json({ error: { code: 'invalid_signature', message: 'Rejected' } });
  }

  try {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = event.resource || {};
      const captureId = resource.id;
      const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;
      const paidAmount = parseFloat(resource.amount?.value || 'NaN');

      if (!captureId || !paypalOrderId || Number.isNaN(paidAmount)) {
        console.error('capture event missing fields', event.id);
        return res.status(200).json({ received: true }); // malformed → don't retry
      }
      if (resource.amount?.currency_code !== 'USD') {
        console.error('non-USD capture refused (webhook):', paypalOrderId, resource.amount?.currency_code);
        return res.status(200).json({ received: true, result: 'currency_mismatch' });
      }

      const { data, error } = await supabase.rpc('apply_credit_purchase', {
        p_paypal_order_id: paypalOrderId,
        p_capture_id: captureId,
        p_paid_amount: paidAmount,
      });
      if (error) {
        console.error('grant rpc failed:', error.message);
        return res.status(500).json({ error: { code: 'grant_failed', message: 'Retry' } }); // transient → let PayPal retry
      }
      const result = Array.isArray(data) ? data[0] : data;
      console.log('webhook grant:', paypalOrderId, result?.message);
      // Business rejections (amount_mismatch, order_not_found, duplicates) are
      // final — return 200 so PayPal stops retrying; they're logged for review.
      return res.status(200).json({ received: true, result: result?.message });
    }

    // Other events (refunds, disputes) are logged for manual handling.
    console.log('PayPal webhook (unhandled type):', event.event_type, event.id);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('paypal-webhook error:', err.message);
    return res.status(500).json({ error: { code: 'internal', message: 'Retry' } });
  }
};
