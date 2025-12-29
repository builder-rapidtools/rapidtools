/**
 * Authentication middleware
 * API key-based authentication for agency access
 */

import { Env, Agency } from './types';
import { Storage } from './storage';

export interface AuthContext {
  agency: Agency;
}

/**
 * Require agency authentication via x-api-key header
 * Returns authenticated agency or throws 401 error
 *
 * SECURITY: No dev-mode bypass. All environments require valid API key.
 */
export async function requireAgencyAuth(
  request: Request,
  env: Env
): Promise<AuthContext> {
  const storage = new Storage(env.REPORTING_KV, env.REPORTING_R2);

  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    throw new AuthError('Missing x-api-key header', 401);
  }

  // Lookup agency by API key
  const agency = await storage.getAgencyByApiKey(apiKey);

  if (!agency) {
    throw new AuthError('Invalid API key', 401);
  }

  return { agency };
}

/**
 * Check if agency subscription is active
 * Throws 402 Payment Required if subscription is inactive or trial expired
 *
 * SECURITY: Enforces trial expiration. Expired trial == canceled.
 */
export function requireActiveSubscription(agency: Agency): void {
  // Check if trial has expired
  if (agency.subscriptionStatus === 'trial') {
    if (agency.trialEndsAt) {
      const trialEndDate = new Date(agency.trialEndsAt);
      const now = new Date();
      if (now > trialEndDate) {
        throw new AuthError(
          'Trial period has expired. Please subscribe to continue.',
          402,
          {
            subscriptionStatus: 'trial_expired',
            trialEndsAt: agency.trialEndsAt,
          }
        );
      }
    }
    // Trial is valid - allow access
    return;
  }

  // For non-trial, only 'active' is allowed
  if (agency.subscriptionStatus !== 'active') {
    throw new AuthError(
      `Subscription inactive. Status: ${agency.subscriptionStatus}`,
      402,
      {
        subscriptionStatus: agency.subscriptionStatus,
      }
    );
  }
}

/**
 * Custom authentication error
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthError';
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      ...this.metadata,
    };
  }
}
