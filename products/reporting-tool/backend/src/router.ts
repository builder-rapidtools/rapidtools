/**
 * API Router
 * Maps HTTP endpoints to handlers
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { handleHealthCheck } from './handlers/health';
import { handleCreateClient, handleListClients, handleDeleteClient } from './handlers/clients';
import { handleUploadGA4Csv } from './handlers/uploads';
import { handleReportPreview, handleReportSend, handleGetReportSignedUrl, handleDownloadReport } from './handlers/reports';
import { handleRegisterAgency, handleGetAgency } from './handlers/agency';
import { handleCreateCheckoutSession, handleStripeWebhookEndpoint } from './handlers/stripe';
import { checkRateLimit, DEFAULT_RATE_LIMIT } from './ratelimit';

export function createRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // CORS - allow frontend domains
  app.use('/*', cors({
    origin: [
      'https://rapidtools-frontend.pages.dev',
      'https://app.rapidtools.dev',
      'http://localhost:3000',
      'http://localhost:8080',
    ],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'x-api-key'],
    credentials: true,
  }));

  // Rate limiting middleware for authenticated endpoints
  // Applies to routes that require x-api-key authentication
  app.use('/api/client/*', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey) {
      const result = await checkRateLimit(c.env.REPORTING_KV, apiKey, DEFAULT_RATE_LIMIT);
      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
      c.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429);
      }
    }
    await next();
  });

  app.use('/api/clients', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey) {
      const result = await checkRateLimit(c.env.REPORTING_KV, apiKey, DEFAULT_RATE_LIMIT);
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
      c.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429);
      }
    }
    await next();
  });

  app.use('/api/agency/me', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey) {
      const result = await checkRateLimit(c.env.REPORTING_KV, apiKey, DEFAULT_RATE_LIMIT);
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
      c.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429);
      }
    }
    await next();
  });

  app.use('/api/agency/checkout', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey) {
      const result = await checkRateLimit(c.env.REPORTING_KV, apiKey, DEFAULT_RATE_LIMIT);
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
      c.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429);
      }
    }
    await next();
  });

  // Rate limit for signed URL generation (requires auth)
  app.use('/api/reports/:clientId/:reportKey/signed-url', async (c, next) => {
    const apiKey = c.req.header('x-api-key');
    if (apiKey) {
      const result = await checkRateLimit(c.env.REPORTING_KV, apiKey, DEFAULT_RATE_LIMIT);
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.current)));
      c.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429);
      }
    }
    await next();
  });

  // Health check
  app.get('/api/health', handleHealthCheck);

  // Agency management
  app.post('/api/agency/register', handleRegisterAgency);
  app.get('/api/agency/me', handleGetAgency);
  app.post('/api/agency/checkout', handleCreateCheckoutSession);
  app.post('/api/agency/stripe/webhook', handleStripeWebhookEndpoint);

  // Client management
  app.post('/api/client', handleCreateClient);
  app.get('/api/clients', handleListClients);
  app.delete('/api/client/:id', handleDeleteClient);

  // Data upload
  app.post('/api/client/:id/ga4-csv', handleUploadGA4Csv);

  // Report generation
  app.post('/api/client/:id/report/preview', handleReportPreview);
  app.post('/api/client/:id/report/send', handleReportSend);

  // Report download (signed URLs)
  app.get('/api/reports/:clientId/:reportKey/signed-url', handleGetReportSignedUrl);
  app.get('/api/reports/:clientId/:reportKey/download', handleDownloadReport);

  // 404 handler
  app.notFound((c) => {
    return c.json({
      success: false,
      error: 'Not found',
    }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json({
      success: false,
      error: 'Internal server error',
    }, 500);
  });

  return app;
}
