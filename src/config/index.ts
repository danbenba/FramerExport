import type { Config } from '../types.js';

export const CFG: Config = {
  viewport: { width: 1440, height: 900 },
  timeout: 90000,
  scrollStep: 250,
  scrollDelay: 60,
  concurrency: 12,
  retries: 3,
  dlTimeout: 30000,
  sharedStripDomains: [
    'sentry.io', 'www.googletagmanager.com', 'connect.facebook.net',
    'stats.g.doubleclick.net',
    'google-analytics.com',
  ],
};
