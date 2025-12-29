/**
 * Report generation handlers
 */

import { Context } from 'hono';
import { Env, ReportPreviewResponse } from '../types';
import { Storage } from '../storage';
import { aggregateMetrics } from './uploads';
import { generateAndStoreReportPDF } from '../pdf';
import { sendReportEmail, buildReportEmailHtml } from '../email';
import { requireAgencyAuth, requireActiveSubscription } from '../auth';

/**
 * POST /api/client/:id/report/preview
 * Generate a preview of the report (JSON structure)
 * Phase 1: Returns JSON preview with metrics
 * Phase 2: Will generate actual PDF
 */
export async function handleReportPreview(c: Context<{ Bindings: Env }>): Promise<Response> {
  const storage = new Storage(c.env.REPORTING_KV, c.env.REPORTING_R2);

  try {
    // Require authentication
    const { agency } = await requireAgencyAuth(c.req.raw, c.env);

    const clientId = c.req.param('id');

    if (!clientId) {
      const response: ReportPreviewResponse = {
        success: false,
        error: 'Missing client ID',
      };
      return c.json(response, 400);
    }

    // Verify client exists
    const client = await storage.getClient(clientId);
    if (!client) {
      const response: ReportPreviewResponse = {
        success: false,
        error: 'Client not found',
      };
      return c.json(response, 404);
    }

    // Verify client belongs to authenticated agency
    if (client.agencyId !== agency.id) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    // Get integration config to find latest CSV
    const integrationConfig = await storage.getIntegrationConfig(clientId);

    if (!integrationConfig || !integrationConfig.ga4CsvLatestKey) {
      const response: ReportPreviewResponse = {
        success: false,
        error: 'No GA4 data uploaded for this client. Please upload a CSV first.',
      };
      return c.json(response, 404);
    }

    // Fetch CSV from R2
    const csvContent = await storage.getCsvFromR2(integrationConfig.ga4CsvLatestKey);

    if (!csvContent) {
      const response: ReportPreviewResponse = {
        success: false,
        error: 'CSV data not found in storage',
      };
      return c.json(response, 500);
    }

    // Parse and aggregate metrics
    const rows = parseGA4Csv(csvContent);
    const metrics = aggregateMetrics(rows);

    const response: ReportPreviewResponse = {
      success: true,
      preview: {
        client: {
          id: client.id,
          agencyId: client.agencyId,
          name: client.name,
          email: client.email,
          brandLogoUrl: client.brandLogoUrl,
          reportSchedule: client.reportSchedule,
          createdAt: client.createdAt,
        },
        metrics,
        generatedAt: new Date().toISOString(),
      },
    };

    return c.json(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return c.json({ success: false, error: error.message }, (error as any).statusCode || 401);
    }

    const response: ReportPreviewResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    return c.json(response, 500);
  }
}

/**
 * GET /api/reports/:clientId/:reportKey/signed-url
 * Generate a time-limited signed URL for PDF download
 * Returns URL valid for 1 hour
 */
export async function handleGetReportSignedUrl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const storage = new Storage(c.env.REPORTING_KV, c.env.REPORTING_R2);

  try {
    // Require authentication
    const { agency } = await requireAgencyAuth(c.req.raw, c.env);

    const clientId = c.req.param('clientId');
    const reportKey = c.req.param('reportKey');

    if (!clientId || !reportKey) {
      return c.json({ success: false, error: 'Missing clientId or reportKey' }, 400);
    }

    // Verify client exists and belongs to agency
    const client = await storage.getClient(clientId);
    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404);
    }

    if (client.agencyId !== agency.id) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    // Construct full R2 key and verify PDF exists
    const pdfKey = `reports/${agency.id}/${clientId}/${reportKey}.pdf`;
    const pdfObject = await c.env.REPORTING_R2.head(pdfKey);

    if (!pdfObject) {
      return c.json({ success: false, error: 'Report not found' }, 404);
    }

    // Generate time-limited token (1 hour expiry)
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
    const tokenData = `${agency.id}:${clientId}:${reportKey}:${expiresAt}`;

    // Create HMAC signature using a secret derived from agency API key
    // In production, use a dedicated signing secret
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(agency.apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenData));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Build signed URL
    const baseUrl = c.env.BASE_URL || 'https://reporting-api.rapidtools.dev';
    const signedUrl = `${baseUrl}/api/reports/${clientId}/${reportKey}/download?expires=${expiresAt}&sig=${signatureHex}`;

    return c.json({
      success: true,
      signedUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresIn: 3600, // seconds
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return c.json({ success: false, error: error.message }, (error as any).statusCode || 401);
    }

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * GET /api/reports/:clientId/:reportKey/download
 * Download PDF using signed URL (no auth header required, validates signature)
 */
export async function handleDownloadReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const storage = new Storage(c.env.REPORTING_KV, c.env.REPORTING_R2);

  try {
    const clientId = c.req.param('clientId');
    const reportKey = c.req.param('reportKey');
    const expires = c.req.query('expires');
    const sig = c.req.query('sig');

    if (!clientId || !reportKey || !expires || !sig) {
      return c.json({ success: false, error: 'Invalid download link' }, 400);
    }

    // Check expiration
    const expiresAt = parseInt(expires, 10);
    if (Date.now() > expiresAt) {
      return c.json({ success: false, error: 'Download link has expired' }, 410);
    }

    // Get client to find agency
    const client = await storage.getClient(clientId);
    if (!client) {
      return c.json({ success: false, error: 'Client not found' }, 404);
    }

    // Get agency to verify signature
    const agency = await storage.getAgency(client.agencyId);
    if (!agency) {
      return c.json({ success: false, error: 'Agency not found' }, 404);
    }

    // Verify signature
    const tokenData = `${agency.id}:${clientId}:${reportKey}:${expires}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(agency.apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedSignature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenData));
    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    if (sig.length !== expectedHex.length) {
      return c.json({ success: false, error: 'Invalid signature' }, 403);
    }
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return c.json({ success: false, error: 'Invalid signature' }, 403);
    }

    // Fetch PDF from R2
    const pdfKey = `reports/${agency.id}/${clientId}/${reportKey}.pdf`;
    const pdfObject = await c.env.REPORTING_R2.get(pdfKey);

    if (!pdfObject) {
      return c.json({ success: false, error: 'Report not found' }, 404);
    }

    // Return PDF with proper headers
    return new Response(pdfObject.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${client.name}-report-${reportKey}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * POST /api/client/:id/report/send
 * Generate PDF report and email it to client
 * Phase 2: Full implementation with PDF generation and email sending
 */
export async function handleReportSend(c: Context<{ Bindings: Env }>): Promise<Response> {
  const storage = new Storage(c.env.REPORTING_KV, c.env.REPORTING_R2);

  try {
    // Require authentication and active subscription
    const { agency } = await requireAgencyAuth(c.req.raw, c.env);
    requireActiveSubscription(agency);

    const clientId = c.req.param('id');

    if (!clientId) {
      return c.json({
        success: false,
        error: 'Missing client ID',
      }, 400);
    }

    // Verify client exists
    const client = await storage.getClient(clientId);
    if (!client) {
      return c.json({
        success: false,
        error: 'Client not found',
      }, 404);
    }

    // Verify client belongs to authenticated agency
    if (client.agencyId !== agency.id) {
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    // Get integration config to find latest CSV
    const integrationConfig = await storage.getIntegrationConfig(clientId);

    if (!integrationConfig || !integrationConfig.ga4CsvLatestKey) {
      return c.json({
        success: false,
        error: 'No GA4 data uploaded for this client. Please upload a CSV first.',
      }, 404);
    }

    // Fetch CSV from R2 and generate metrics
    const csvContent = await storage.getCsvFromR2(integrationConfig.ga4CsvLatestKey);

    if (!csvContent) {
      return c.json({
        success: false,
        error: 'CSV data not found in storage',
      }, 500);
    }

    // Parse and aggregate metrics
    const rows = parseGA4Csv(csvContent);
    const metrics = aggregateMetrics(rows);

    const generatedAt = new Date().toISOString();

    // Build preview data structure
    const previewData = {
      client,
      metrics,
      generatedAt,
    };

    // Generate and store PDF
    const pdfResult = await generateAndStoreReportPDF(c.env, previewData);

    // Extract report key from pdfKey for signed URL generation
    // pdfKey format: reports/{agencyId}/{clientId}/{timestamp}.pdf
    const pdfKeyParts = pdfResult.pdfKey.split('/');
    const reportKey = pdfKeyParts[pdfKeyParts.length - 1].replace('.pdf', '');

    // Generate signed URL for email (expires in 7 days for email recipients)
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    const tokenData = `${agency.id}:${clientId}:${reportKey}:${expiresAt}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(agency.apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenData));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const baseUrl = c.env.BASE_URL || 'https://reporting-api.rapidtools.dev';
    const pdfSignedUrl = `${baseUrl}/api/reports/${clientId}/${reportKey}/download?expires=${expiresAt}&sig=${signatureHex}`;

    // Build HTML email summary
    const htmlSummary = buildReportEmailHtml({
      clientName: client.name,
      periodStart: metrics.periodStart,
      periodEnd: metrics.periodEnd,
      sessions: metrics.sessions,
      users: metrics.users,
      pageviews: metrics.pageviews,
      topPages: metrics.topPages,
    });

    // Send email with real signed URL
    const emailResult = await sendReportEmail(c.env, {
      to: client.email,
      subject: `Weekly Report: ${client.name}`,
      htmlSummary,
      pdfSignedUrl,
    });

    // Update client's lastReportSentAt
    client.lastReportSentAt = generatedAt;
    await storage.saveClient(client);

    // Return success response
    return c.json({
      success: true,
      clientId: client.id,
      sentTo: client.email,
      pdfKey: pdfResult.pdfKey,
      pdfSizeBytes: pdfResult.sizeBytes,
      devMode: emailResult.devMode || false,
      provider: emailResult.provider,
      messageId: emailResult.messageId,
      sentAt: generatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return c.json({ success: false, error: error.message, ...(error as any).metadata }, (error as any).statusCode || 401);
    }

    console.error('Report send failed:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * Parse GA4 CSV (duplicate of uploads.ts function for now)
 * TODO: Extract to shared utils module
 */
function parseGA4Csv(csvContent: string): any[] {
  const lines = csvContent.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV must contain header row and at least one data row');
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());

  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());

    if (values.length !== header.length) {
      continue;
    }

    const row: any = {
      date: values[header.indexOf('date')],
      sessions: parseInt(values[header.indexOf('sessions')], 10) || 0,
      users: parseInt(values[header.indexOf('users')], 10) || 0,
      pageviews: parseInt(values[header.indexOf('pageviews')], 10) || 0,
    };

    const pagePathIndex = header.indexOf('page_path');
    if (pagePathIndex !== -1) {
      row.page_path = values[pagePathIndex];
    }

    const pageViewsIndex = header.indexOf('page_views');
    if (pageViewsIndex !== -1) {
      row.page_views = parseInt(values[pageViewsIndex], 10) || 0;
    }

    rows.push(row);
  }

  return rows;
}
