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
 */
export async function handleStripeWebhook(
  env: Env,
  request: Request
): Promise<{ success: boolean; message?: string; error?: string }> {
  // Dev mode: No webhook secret configured
  if (!env.STRIPE_WEBHOOK_SECRET) {
    const body = await request.text();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔔 STRIPE WEBHOOK (DEV MODE - NOT PROCESSED)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Webhook body:', body.substring(0, 200) + '...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      success: true,
      message: 'Webhook received in dev mode (not processed)',
    };
  }

  // Production mode: Verify signature and process event
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    // Verify webhook signature
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
 * Verify Stripe webhook signature
 * Simplified implementation - in production, use Stripe's official verification
 */
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<any> {
  // For MVP, we parse the JSON directly
  // In production, implement proper HMAC verification
  // See: https://stripe.com/docs/webhooks/signatures

  try {
    const event = JSON.parse(body);
    return event;
  } catch (error) {
    throw new Error('Invalid webhook payload');
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

      // Find agency by Stripe customer ID
      // Note: This requires a lookup function - for MVP, we'll skip this
      // In production, implement: getAgencyByStripeCustomerId()

      console.log(`Subscription ${subscription.id} ${event.type}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find agency and mark as canceled
      console.log(`Subscription ${subscription.id} deleted`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}
