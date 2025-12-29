/**
 * Stripe integration module
 * Handles checkout sessions and webhook events
 */

import { Env, Agency } from './types';
import { Storage } from './storage';

export interface CheckoutSession {
  url: string;
  sessionId: string;
  devMode?: boolean;
}

/**
 * Create a Stripe Checkout Session for agency subscription
 */
export async function createCheckoutSessionForAgency(
  env: Env,
  agency: Agency
): Promise<CheckoutSession> {
  // Dev mode: No Stripe keys configured
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID_STARTER) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 STRIPE CHECKOUT (DEV MODE)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Agency: ${agency.name} (${agency.id})`);
    console.log(`Billing Email: ${agency.billingEmail}`);
    console.log('Price: Starter Plan (£25/month)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      url: 'https://example.com/dev-checkout',
      sessionId: 'dev-session-' + Date.now(),
      devMode: true,
    };
  }

  // Production mode: Create real Stripe Checkout Session
  try {
    const baseUrl = env.FRONTEND_URL || env.BASE_URL || 'http://localhost:8787';

    const payload = {
      customer_email: agency.billingEmail,
      client_reference_id: agency.id,
      mode: 'subscription',
      line_items: [
        {
          price: env.STRIPE_PRICE_ID_STARTER,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/canceled`,
      metadata: {
        agencyId: agency.id,
      },
    };

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      },
      body: new URLSearchParams(payload as any).toString(),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${data.error?.message || response.statusText}`);
    }

    return {
      url: data.url,
      sessionId: data.id,
    };
  } catch (error) {
    console.error('Stripe checkout session creation failed:', error);
    throw error;
  }
}

/**
 * Handle Stripe webhook events
 *
 * SECURITY: Always verifies signature. No dev-mode bypass.
 */
export async function handleStripeWebhook(
  env: Env,
  request: Request
): Promise<{ success: boolean; message?: string; error?: string }> {
  // SECURITY: Webhook secret is REQUIRED. Fail closed if not configured.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return {
      success: false,
      error: 'Webhook processing not configured',
    };
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return {
        success: false,
        error: 'Missing stripe-signature header',
      };
    }

    // Verify webhook signature (cryptographic verification)
    const event = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);

    // Process event
    await processStripeEvent(env, event);

    return {
      success: true,
      message: `Event ${event.type} processed`,
    };
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verify Stripe webhook signature using HMAC-SHA256
 *
 * Stripe signature format: t=timestamp,v1=signature
 * Expected signature: HMAC-SHA256(timestamp.payload, secret)
 *
 * SECURITY: Implements cryptographic verification with replay protection.
 */
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<any> {
  // Parse signature header: t=timestamp,v1=sig1,v1=sig2,...
  const elements = signature.split(',');
  const timestampElement = elements.find(e => e.startsWith('t='));
  const signatureElements = elements.filter(e => e.startsWith('v1='));

  if (!timestampElement) {
    throw new Error('Invalid signature: missing timestamp');
  }

  if (signatureElements.length === 0) {
    throw new Error('Invalid signature: missing v1 signature');
  }

  const timestamp = timestampElement.substring(2);
  const signatures = signatureElements.map(e => e.substring(3));

  // Replay attack protection: reject if timestamp is too old (5 minutes)
  const timestampSeconds = parseInt(timestamp, 10);
  const currentSeconds = Math.floor(Date.now() / 1000);
  const tolerance = 300; // 5 minutes

  if (isNaN(timestampSeconds) || Math.abs(currentSeconds - timestampSeconds) > tolerance) {
    throw new Error('Invalid signature: timestamp outside tolerance window');
  }

  // Compute expected signature: HMAC-SHA256(timestamp.payload, secret)
  const signedPayload = `${timestamp}.${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  // Convert to hex string
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  const signatureValid = signatures.some(sig => {
    if (sig.length !== expectedSignature.length) {
      return false;
    }
    let result = 0;
    for (let i = 0; i < sig.length; i++) {
      result |= sig.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  });

  if (!signatureValid) {
    throw new Error('Invalid signature: verification failed');
  }

  // Signature valid - parse and return event
  try {
    const event = JSON.parse(body);
    return event;
  } catch (error) {
    throw new Error('Invalid webhook payload: malformed JSON');
  }
}

/**
 * Process Stripe webhook event
 */
async function processStripeEvent(env: Env, event: any): Promise<void> {
  const storage = new Storage(env.REPORTING_KV, env.REPORTING_R2);

  console.log(`Processing Stripe event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const agencyId = session.metadata?.agencyId || session.client_reference_id;

      if (!agencyId) {
        console.error('No agency ID in checkout session metadata');
        return;
      }

      const agency = await storage.getAgency(agencyId);
      if (!agency) {
        console.error(`Agency not found: ${agencyId}`);
        return;
      }

      // Update agency with Stripe customer ID
      agency.stripeCustomerId = session.customer;
      agency.subscriptionStatus = 'active';
      await storage.updateAgency(agency);

      console.log(`Agency ${agencyId} activated via checkout`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find agency by Stripe customer ID and update status based on subscription
      const agencyForUpdate = await storage.getAgencyByStripeCustomerId(customerId);
      if (agencyForUpdate) {
        // Map Stripe subscription status to our status
        const stripeStatus = subscription.status;
        if (stripeStatus === 'active' || stripeStatus === 'trialing') {
          agencyForUpdate.subscriptionStatus = 'active';
        } else if (stripeStatus === 'past_due') {
          agencyForUpdate.subscriptionStatus = 'past_due';
        } else if (stripeStatus === 'canceled' || stripeStatus === 'unpaid') {
          agencyForUpdate.subscriptionStatus = 'canceled';
        }
        agencyForUpdate.stripeSubscriptionId = subscription.id;
        await storage.updateAgency(agencyForUpdate);
        console.log(`Agency ${agencyForUpdate.id} subscription updated: ${agencyForUpdate.subscriptionStatus}`);
      } else {
        console.log(`No agency found for Stripe customer ${customerId}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // SECURITY: Immediately revoke access on subscription cancellation
      const agencyToCancel = await storage.getAgencyByStripeCustomerId(customerId);
      if (agencyToCancel) {
        agencyToCancel.subscriptionStatus = 'canceled';
        await storage.updateAgency(agencyToCancel);
        console.log(`Agency ${agencyToCancel.id} access REVOKED - subscription deleted`);
      } else {
        console.error(`CRITICAL: Subscription deleted but no agency found for customer ${customerId}`);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}
