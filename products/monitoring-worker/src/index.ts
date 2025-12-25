/**
 * RapidTools API Monitoring Worker
 *
 * Checks health endpoints for validation and reporting APIs
 * Sends email alerts on failures
 */

export interface Env {
  ALERT_EMAIL: string;
  ALERT_FROM: string;
  // Optional: Add your email service API key here
  // RESEND_API_KEY?: string;
  // SENDGRID_API_KEY?: string;
}

interface HealthCheck {
  name: string;
  url: string;
  requiresAuth: boolean;
  expectedOk: boolean;
}

const HEALTH_CHECKS: HealthCheck[] = [
  {
    name: 'Validation API Health',
    url: 'https://validation-api.rapidtools.dev/health',
    requiresAuth: false,
    expectedOk: true,
  },
  {
    name: 'Reporting API Health',
    url: 'https://reporting-api.rapidtools.dev/api/health',
    requiresAuth: false,
    expectedOk: true,
  },
];

async function checkEndpoint(check: HealthCheck): Promise<{ success: boolean; message: string; status?: number }> {
  try {
    const response = await fetch(check.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'RapidTools-Monitor/1.0',
      },
    });

    const status = response.status;

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${status}`,
        status,
      };
    }

    const data = await response.json() as any;

    if (check.expectedOk && data.ok !== true) {
      return {
        success: false,
        message: `Response ok:false`,
        status,
      };
    }

    return {
      success: true,
      message: 'OK',
      status,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendEmailAlert(env: Env, failures: Array<{ check: HealthCheck; result: any }>): Promise<void> {
  // Simple email alert using MailChannels (free for Cloudflare Workers)
  // Alternative: Replace with your preferred email service (Resend, SendGrid, etc.)

  const emailBody = `
RapidTools API Monitoring Alert

The following endpoints are DOWN:

${failures.map(f => `
❌ ${f.check.name}
   URL: ${f.check.url}
   Error: ${f.result.message}
   ${f.result.status ? `Status: ${f.result.status}` : ''}
`).join('\n')}

Time: ${new Date().toISOString()}
  `.trim();

  try {
    // Using MailChannels (free with Cloudflare Workers)
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: env.ALERT_EMAIL }],
          },
        ],
        from: {
          email: env.ALERT_FROM,
          name: 'RapidTools Monitoring',
        },
        subject: `[ALERT] RapidTools API Down - ${failures.length} endpoint(s) failing`,
        content: [
          {
            type: 'text/plain',
            value: emailBody,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Failed to send alert email:', await response.text());
    } else {
      console.log('Alert email sent successfully');
    }
  } catch (error) {
    console.error('Error sending alert email:', error);
  }
}

async function runMonitoring(env: Env): Promise<Response> {
  const results = await Promise.all(
    HEALTH_CHECKS.map(async (check) => {
      const result = await checkEndpoint(check);
      return { check, result };
    })
  );

  const failures = results.filter(r => !r.result.success);
  const successes = results.filter(r => r.result.success);

  // Log results
  console.log(`Monitoring check completed:`);
  console.log(`  ✅ ${successes.length} endpoints healthy`);
  console.log(`  ❌ ${failures.length} endpoints down`);

  // Send alert if there are failures
  if (failures.length > 0) {
    console.log('Sending alert email...');
    await sendEmailAlert(env, failures);
  }

  // Return summary
  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    total: HEALTH_CHECKS.length,
    healthy: successes.length,
    down: failures.length,
    checks: results.map(r => ({
      name: r.check.name,
      url: r.check.url,
      success: r.result.success,
      message: r.result.message,
      status: r.result.status,
    })),
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export default {
  // Scheduled monitoring (cron trigger)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled monitoring check...');
    ctx.waitUntil(runMonitoring(env));
  },

  // Manual trigger via HTTP (for testing)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/check') {
      return await runMonitoring(env);
    }

    return new Response(JSON.stringify({
      service: 'rapidtools-monitoring',
      version: '1.0.0',
      endpoints: {
        check: '/check - Run monitoring check manually',
      },
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
};
