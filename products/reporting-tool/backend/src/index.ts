/**
 * Cloudflare Worker entrypoint
 * RapidTools Automated Weekly Client Reporting Tool - Backend API
 */

import { createRouter } from './router';

const app = createRouter();

export default app;
